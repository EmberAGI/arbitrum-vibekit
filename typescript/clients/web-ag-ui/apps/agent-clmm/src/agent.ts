import { pathToFileURL } from 'node:url';

import { END, InMemoryStore, START, StateGraph } from '@langchain/langgraph';
import { Client } from '@langchain/langgraph-sdk';
import { v7 as uuidv7 } from 'uuid';
import { privateKeyToAccount } from 'viem/accounts';

import {
  resolveLangGraphDefaults,
  resolveLangGraphDurability,
  type LangGraphDurability,
} from './config/serviceConfig.js';
import { resolveThreadId } from './utils/threadId.js';
import {
  ClmmStateAnnotation,
  memory,
  normalizeHexAddress,
  type ClmmState,
} from './workflow/context.js';
import { configureCronExecutor } from './workflow/cronScheduler.js';
import { configureLangGraphApiCheckpointer } from './workflow/langgraphApiCheckpointer.js';
import { bootstrapNode } from './workflow/nodes/bootstrap.js';
import { collectDelegationsNode } from './workflow/nodes/collectDelegations.js';
import { collectFundingTokenInputNode } from './workflow/nodes/collectFundingTokenInput.js';
import { collectOperatorInputNode } from './workflow/nodes/collectOperatorInput.js';
import { fireCommandNode } from './workflow/nodes/fireCommand.js';
import { hireCommandNode } from './workflow/nodes/hireCommand.js';
import { listPoolsNode } from './workflow/nodes/listPools.js';
import { pollCycleNode } from './workflow/nodes/pollCycle.js';
import { prepareOperatorNode } from './workflow/nodes/prepareOperator.js';
import { resolveCommandTarget, runCommandNode } from './workflow/nodes/runCommand.js';
import { runCycleCommandNode } from './workflow/nodes/runCycleCommand.js';
import { summarizeNode } from './workflow/nodes/summarize.js';
import { syncStateNode } from './workflow/nodes/syncState.js';
import { saveBootstrapContext } from './workflow/store.js';

/**
 * Routes after bootstrap based on the original command.
 * - sync: go to syncState (just return state after bootstrap)
 * - hire/cycle: continue to listPools for full setup flow
 */
function resolvePostBootstrap(state: ClmmState): 'listPools' | 'syncState' {
  return state.view.command === 'sync' ? 'syncState' : 'listPools';
}

const store = new InMemoryStore();
const DEFAULT_DURABILITY = resolveLangGraphDefaults().durability;
const CLMM_GRAPH_ID = 'agent-clmm';
const langGraphClient = new Client({
  apiUrl: process.env['LANGGRAPH_DEPLOYMENT_URL'] ?? 'http://localhost:8124',
});
let cachedAssistantId: string | null = null;

async function resolveAssistantId(): Promise<string> {
  if (cachedAssistantId) {
    return cachedAssistantId;
  }

  const assistants = await langGraphClient.assistants.search({ graphId: CLMM_GRAPH_ID, limit: 1 });
  if (assistants.length > 0) {
    cachedAssistantId = assistants[0]?.assistant_id ?? null;
    if (cachedAssistantId) {
      return cachedAssistantId;
    }
  }

  const created = await langGraphClient.assistants.create({
    assistantId: CLMM_GRAPH_ID,
    graphId: CLMM_GRAPH_ID,
    name: CLMM_GRAPH_ID,
    ifExists: 'do_nothing',
  });
  cachedAssistantId = created.assistant_id;
  return cachedAssistantId;
}

async function ensureThreadExists(threadId: string): Promise<void> {
  await langGraphClient.threads.create({
    threadId,
    graphId: CLMM_GRAPH_ID,
    ifExists: 'do_nothing',
  });
}

await configureLangGraphApiCheckpointer();

const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
if (!rawAgentPrivateKey) {
  throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
}
const agentPrivateKey = normalizeHexAddress(rawAgentPrivateKey, 'agent private key');
const account = privateKeyToAccount(agentPrivateKey);
const agentWalletAddress = normalizeHexAddress(account.address, 'agent wallet address');

await saveBootstrapContext({ privateKey: agentPrivateKey, agentWalletAddress }, store);

const workflow = new StateGraph(ClmmStateAnnotation)
  .addNode('runCommand', runCommandNode)
  .addNode('hireCommand', hireCommandNode)
  .addNode('fireCommand', fireCommandNode)
  .addNode('runCycleCommand', runCycleCommandNode)
  .addNode('syncState', syncStateNode)
  .addNode('bootstrap', bootstrapNode)
  .addNode('listPools', listPoolsNode)
  .addNode('collectOperatorInput', collectOperatorInputNode)
  .addNode('collectFundingTokenInput', collectFundingTokenInputNode)
  .addNode('collectDelegations', collectDelegationsNode)
  .addNode('prepareOperator', prepareOperatorNode)
  .addNode('pollCycle', pollCycleNode, { ends: ['summarize'] })
  .addNode('summarize', summarizeNode)
  .addEdge(START, 'runCommand')
  .addConditionalEdges('runCommand', resolveCommandTarget)
  .addEdge('hireCommand', 'bootstrap')
  .addEdge('fireCommand', END)
  .addEdge('runCycleCommand', 'pollCycle')
  .addEdge('syncState', END)
  .addConditionalEdges('bootstrap', resolvePostBootstrap)
  .addEdge('listPools', 'collectOperatorInput')
  .addEdge('collectOperatorInput', 'collectFundingTokenInput')
  .addEdge('collectFundingTokenInput', 'collectDelegations')
  .addEdge('collectDelegations', 'prepareOperator')
  .addEdge('prepareOperator', 'pollCycle')
  .addEdge('pollCycle', 'summarize')
  .addEdge('summarize', END);

export const clmmGraph = workflow.compile({
  checkpointer: memory,
  store,
});

const runningThreads = new Set<string>();

export async function runGraphOnce(
  threadId: string,
  options?: { durability?: LangGraphDurability },
) {
  if (runningThreads.has(threadId)) {
    console.info(`[cron] Skipping tick - run already in progress (thread=${threadId})`);
    return;
  }

  runningThreads.add(threadId);
  const startedAt = Date.now();
  console.info(`[cron] Starting CLMM graph run (thread=${threadId})`);

  const runMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'cycle' }),
  };

  try {
    const assistantId = await resolveAssistantId();
    await ensureThreadExists(threadId);

    // When a graph reaches END, subsequent invoke() calls return immediately without
    // running any nodes. Use updateState with asNode to "rewind" the execution point
    // so the graph restarts from runCommand on the next run.
    // Note: updateState(..., asNode="runCommand") treats this patch as the output of
    // runCommand, so ensure we set view.command to the intended value.
    await langGraphClient.threads.updateState(threadId, {
      values: { messages: [runMessage], view: { command: 'cycle' } },
      asNode: 'runCommand',
    });

    const run = await langGraphClient.runs.create(threadId, assistantId, {
      input: null,
      streamMode: ['events', 'values', 'updates'],
      streamResumable: true,
      durability: resolveLangGraphDurability(options?.durability ?? DEFAULT_DURABILITY),
    });

    await langGraphClient.runs.join(threadId, run.run_id);
    const state = await langGraphClient.threads.getState(threadId);
    const interrupts = state.tasks?.[0]?.interrupts ?? [];
    if (interrupts.length > 0) {
      console.warn(
        '[cron] Graph interrupted awaiting operator input; supply input via UI and rerun.',
      );
    }
    console.info(`[cron] Run complete in ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error('[cron] Graph run failed', error);
  } finally {
    runningThreads.delete(threadId);
  }
}

export async function startClmmCron(
  threadId: string,
  options?: { durability?: LangGraphDurability },
) {
  await runGraphOnce(threadId, options);
}

configureCronExecutor(runGraphOnce);

const invokedAsEntryPoint =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedAsEntryPoint) {
  const initialThreadId = resolveThreadId({
    agentId: CLMM_GRAPH_ID,
    walletAddress: process.env['CLMM_WALLET_ADDRESS'],
    sourceLabel: 'cron',
  });

  await startClmmCron(initialThreadId);
}

export { executeDecision } from './workflow/execution.js';
export type {
  ClmmEvent,
  ClmmState,
  DelegationBundle,
  DelegationSigningInterrupt,
  FundingTokenInterrupt,
  OperatorInterrupt,
} from './workflow/context.js';
