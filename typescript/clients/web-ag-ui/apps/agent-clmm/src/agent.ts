import { pathToFileURL } from 'node:url';

import { END, GraphInterrupt, InMemoryStore, START, StateGraph } from '@langchain/langgraph';
import { v7 as uuidv7 } from 'uuid';
import { privateKeyToAccount } from 'viem/accounts';

import { ClmmStateAnnotation, memory, normalizeHexAddress } from './workflow/context.js';
import { configureCronExecutor } from './workflow/cronScheduler.js';
import { bootstrapNode } from './workflow/nodes/bootstrap.js';
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

const store = new InMemoryStore();

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
  .addNode('prepareOperator', prepareOperatorNode)
  .addNode('pollCycle', pollCycleNode, { ends: ['summarize'] })
  .addNode('summarize', summarizeNode)
  .addEdge(START, 'runCommand')
  .addConditionalEdges('runCommand', resolveCommandTarget)
  .addEdge('hireCommand', 'bootstrap')
  .addEdge('fireCommand', END)
  .addEdge('runCycleCommand', 'pollCycle')
  .addEdge('syncState', END)
  .addEdge('bootstrap', 'listPools')
  .addEdge('listPools', 'collectOperatorInput')
  .addEdge('collectOperatorInput', 'prepareOperator')
  .addEdge('prepareOperator', 'pollCycle')
  .addEdge('pollCycle', 'summarize')
  .addEdge('summarize', END);

export const clmmGraph = workflow.compile({
  checkpointer: memory,
  store,
});

const runningThreads = new Set<string>();

export async function runGraphOnce(threadId: string) {
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
    // Use invoke() instead of stream() - cron runs have no HTTP streaming context
    await clmmGraph.invoke(
      { messages: [runMessage] },
      {
        configurable: { thread_id: threadId },
      },
    );
    console.info(`[cron] Run complete in ${Date.now() - startedAt}ms`);
  } catch (error) {
    if (error instanceof GraphInterrupt) {
      console.warn(
        '[cron] Graph interrupted awaiting operator input; supply input via UI and rerun.',
      );
      return;
    }

    console.error('[cron] Graph run failed', error);
  } finally {
    runningThreads.delete(threadId);
  }
}

export async function startClmmCron(threadId: string) {
  const initialRunMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'cycle' }),
  };

  // Cron scheduling happens in pollCycle after first cycle completes
  const stream = await clmmGraph.stream(
    { messages: [initialRunMessage] },
    {
      configurable: { thread_id: threadId },
    },
  );
  for await (const event of stream) {
    void event;
  }
}

configureCronExecutor(runGraphOnce);

const invokedAsEntryPoint =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedAsEntryPoint) {
  const initialThreadId = process.env['CLMM_THREAD_ID'];
  if (!initialThreadId) {
    throw new Error('CLMM_THREAD_ID environment variable is required to start the CLMM scheduler.');
  }

  await startClmmCron(initialThreadId);
}

export { executeDecision } from './workflow/execution.js';
export type { ClmmEvent, ClmmState, OperatorInterrupt } from './workflow/context.js';
