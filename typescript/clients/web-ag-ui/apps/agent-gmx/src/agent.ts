import { pathToFileURL } from 'node:url';

import { END, GraphInterrupt, InMemoryStore, START, StateGraph } from '@langchain/langgraph';
import { v7 as uuidv7 } from 'uuid';
import { privateKeyToAccount } from 'viem/accounts';

import {
  GMXStateAnnotation,
  memory,
  normalizeHexAddress,
  type GMXState,
} from './workflow/context.js';
import { configureCronExecutor } from './workflow/cronScheduler.ts';
import { fireCommandNode } from './workflow/nodes/fireCommand.js';
import { hireCommandNode } from './workflow/nodes/hireCommand.js';
import { resolveCommandTarget, runCommandNode } from './workflow/nodes/runCommand.js';

const store = new InMemoryStore();

const rawAgentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
if (!rawAgentPrivateKey) {
  throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
}

const agentPrivateKey = normalizeHexAddress(rawAgentPrivateKey, 'agent private key');
const account = privateKeyToAccount(agentPrivateKey);
const agentWalletAddress = normalizeHexAddress(account.address, 'agent wallet address');

const workflow = new StateGraph(GMXStateAnnotation)
  .addNode('runCommand', runCommandNode)
  .addNode('hireCommand', hireCommandNode)
  .addNode('fireCommand', fireCommandNode);

workflow
  .addEdge(START, 'runCommand')
  .addConditionalEdges('runCommand', resolveCommandTarget)
  .addEdge('hireCommand', END);
//   .addEdge('fireCommand', END);

export const gmxGraph = workflow.compile({
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
  console.info(`[cron] Starting GMX graph run (thread=${threadId})`);

  const runMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'hire' }),
  };

  // Cron jobs are scheduled inside an AG-UI request context, so their ticks inherit
  // AsyncLocalStorage runnable config (including EventStreamCallbackHandler tied to a
  // closed SSE stream). Explicitly override callbacks to prevent "WritableStream is closed"
  // errors during background runs.
  const config = { configurable: { thread_id: threadId }, callbacks: [] };

  try {
    // When a graph reaches END, subsequent invoke() calls return immediately without
    // running any nodes. Use updateState with asNode to "rewind" the execution point
    // so the graph restarts from runCommand on the next invoke.
    // Note: updateState(..., asNode="runCommand") treats this patch as the output of
    // runCommand, so ensure we set view.command to the intended value.
    await gmxGraph.updateState(
      config,
      { messages: [runMessage], view: { command: 'hire' } },
      'runCommand',
    );

    // Now invoke - the graph will continue from the node after runCommand
    await gmxGraph.invoke(null, config);
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

export async function startGmxCron(threadId: string) {
  const initialRunMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'cycle' }),
  };

  // Cron scheduling happens in pollCycle after first cycle completes
  const stream = await gmxGraph.stream(
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
  // Thread ids scope LangGraph checkpointing/state. For the cron-driven worker we only need a
  // stable id for the lifetime of the process, so generate one if not provided.
  const initialThreadId = process.env['GMX_THREAD_ID'] ?? uuidv7();
  if (!process.env['GMX_THREAD_ID']) {
    console.info(`[cron] GMX_THREAD_ID not provided; generated thread id ${initialThreadId}`);
  }

  await startGmxCron(initialThreadId);
}

// gmxGraph.name = 'agent-gmx';
