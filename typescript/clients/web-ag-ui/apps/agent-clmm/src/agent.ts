import { pathToFileURL } from 'node:url';

import { END, GraphInterrupt, InMemoryStore, START, StateGraph } from '@langchain/langgraph';
import cron from 'node-cron';
import { v7 as uuidv7 } from 'uuid';
import { privateKeyToAccount } from 'viem/accounts';

import { ClmmStateAnnotation, memory, normalizeHexAddress } from './workflow/context.js';
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
import { saveBootstrapContext } from './workflow/store.js';

const store = new InMemoryStore();

const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
if (!rawAgentPrivateKey) {
  throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
}
const agentPrivateKey = normalizeHexAddress(rawAgentPrivateKey, 'agent private key');
const account = privateKeyToAccount(agentPrivateKey);
const agentWalletAddress = normalizeHexAddress(account.address, 'agent wallet address');

await saveBootstrapContext({ account, agentWalletAddress }, store);

const workflow = new StateGraph(ClmmStateAnnotation)
  .addNode('runCommand', runCommandNode)
  .addNode('hireCommand', hireCommandNode)
  .addNode('fireCommand', fireCommandNode)
  .addNode('runCycleCommand', runCycleCommandNode)
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

const cronExpression = '*/1 * * * *';
const cronJobs = new Map<string, cron.ScheduledTask>();

export async function runGraphOnce(threadId: string) {
  const startedAt = Date.now();
  console.info(`[cron] Starting CLMM graph run (thread=${threadId})`);

  const runMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'cycle' }),
  };

  try {
    const stream = await clmmGraph.stream(
      { messages: [runMessage] },
      {
        configurable: { thread_id: threadId },
      },
    );
    // streaming ensures all nodes execute; events are handled inside nodes
    for await (const event of stream) {
      void event;
    }
    console.info(`[cron] Run complete in ${Date.now() - startedAt}ms`);
  } catch (error) {
    if (error instanceof GraphInterrupt) {
      console.warn('[cron] Graph interrupted awaiting operator input; supply input via UI and rerun.');
      return;
    }

    console.error('[cron] Graph run failed', error);
  }
}

export function ensureCronForThread(threadId: string) {
  if (cronJobs.has(threadId)) {
    return cronJobs.get(threadId);
  }

  console.info(`[cron] Scheduling CLMM graph with expression "${cronExpression}" (thread=${threadId})`);
  const job = cron.schedule(cronExpression, () => {
    void runGraphOnce(threadId);
  });
  cronJobs.set(threadId, job);
  return job;
}

export async function startClmmCron(threadId: string) {
  const initialRunMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'cycle' }),
  };

  const stream = await clmmGraph.stream(
    { messages: [initialRunMessage] },
    {
      configurable: {
        thread_id: threadId,
        scheduleCron: ensureCronForThread,
      },
    },
  );
  for await (const event of stream) {
    void event;
  }
}

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
