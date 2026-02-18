import { pathToFileURL } from 'node:url';

import { END, START, StateGraph } from '@langchain/langgraph';
import { isLangGraphBusyStatus } from 'agent-workflow-core';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

import {
  resolveLangGraphDefaults,
  resolveLangGraphDurability,
  type LangGraphDurability,
} from './config/serviceConfig.js';
import { ClmmStateAnnotation, memory, type ClmmState } from './workflow/context.js';
import { configureCronExecutor } from './workflow/cronScheduler.js';
import { bootstrapNode } from './workflow/nodes/bootstrap.js';
import { collectDelegationsNode } from './workflow/nodes/collectDelegations.js';
import { collectFundingTokenInputNode } from './workflow/nodes/collectFundingTokenInput.js';
import { collectOperatorInputNode } from './workflow/nodes/collectOperatorInput.js';
import { fireCommandNode } from './workflow/nodes/fireCommand.js';
import { hireCommandNode } from './workflow/nodes/hireCommand.js';
import { listPoolsNode } from './workflow/nodes/listPools.js';
import { pollCycleNode } from './workflow/nodes/pollCycle.js';
import { prepareOperatorNode } from './workflow/nodes/prepareOperator.js';
import { extractCommand, resolveCommandTarget, runCommandNode } from './workflow/nodes/runCommand.js';
import { runCycleCommandNode } from './workflow/nodes/runCycleCommand.js';
import { summarizeNode } from './workflow/nodes/summarize.js';
import { syncStateNode } from './workflow/nodes/syncState.js';

function resolvePostBootstrap(
  state: ClmmState,
):
  | 'listPools'
  | 'collectOperatorInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'syncState' {
  const command = extractCommand(state.messages) ?? state.view.command;
  if (command === 'sync') {
    return 'syncState';
  }
  if (!state.view.poolArtifact) {
    return 'listPools';
  }
  if (!state.view.operatorInput) {
    return 'collectOperatorInput';
  }
  if (!state.view.fundingTokenInput) {
    return 'collectFundingTokenInput';
  }
  if (state.view.delegationsBypassActive !== true && !state.view.delegationBundle) {
    return 'collectDelegations';
  }
  if (!state.view.operatorConfig) {
    return 'prepareOperator';
  }
  return 'syncState';
}

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

export const graph = workflow.compile({
  checkpointer: memory,
});

const runningThreads = new Set<string>();
const ThreadResponseSchema = z.object({ thread_id: z.string() }).catchall(z.unknown());
const ThreadStateUpdateResponseSchema = z
  .object({ checkpoint_id: z.string().optional() })
  .catchall(z.unknown());
const RunResponseSchema = z
  .object({ run_id: z.string(), status: z.string().optional() })
  .catchall(z.unknown());

type RunStatus = string | undefined;

function resolveLangGraphDeploymentUrl(): string {
  const raw = process.env['LANGGRAPH_DEPLOYMENT_URL'] ?? 'http://localhost:8123';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function resolveLangGraphGraphId(): string {
  return process.env['LANGGRAPH_GRAPH_ID'] ?? 'starterAgent';
}

async function parseJsonResponse<T>(response: Response, schema: z.ZodSchema<T>): Promise<T> {
  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`LangGraph API request failed (${response.status}): ${payloadText}`);
  }
  const trimmed = payloadText.trim();
  const payload = trimmed.length > 0 ? (JSON.parse(trimmed) as unknown) : ({} as unknown);
  return schema.parse(payload);
}

type ThreadStateValues = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function extractThreadStateValues(payload: unknown): ThreadStateValues | null {
  if (!isRecord(payload)) {
    return null;
  }

  const values = payload['values'];
  if (isRecord(values)) {
    return values;
  }

  const state = payload['state'];
  if (isRecord(state)) {
    return state;
  }

  const data = payload['data'];
  if (isRecord(data)) {
    return data;
  }

  if (isRecord(payload['view'])) {
    return payload;
  }

  return null;
}

async function fetchThreadStateValues(
  baseUrl: string,
  threadId: string,
): Promise<ThreadStateValues | null> {
  const response = await fetch(`${baseUrl}/threads/${threadId}/state`);
  const payload = await parseJsonResponse(response, z.unknown());
  return extractThreadStateValues(payload);
}

async function ensureThread(baseUrl: string, threadId: string, graphId: string) {
  const metadata = { graph_id: graphId };
  const response = await fetch(`${baseUrl}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, if_exists: 'do_nothing', metadata }),
  });
  await parseJsonResponse(response, ThreadResponseSchema);

  const patchResponse = await fetch(`${baseUrl}/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });
  await parseJsonResponse(patchResponse, ThreadResponseSchema);
}

async function updateCycleState(
  baseUrl: string,
  threadId: string,
  runMessage: { id: string; role: 'user'; content: string },
): Promise<boolean> {
  let existingView: Record<string, unknown> | null = null;
  try {
    const currentState = await fetchThreadStateValues(baseUrl, threadId);
    if (currentState && isRecord(currentState['view'])) {
      existingView = currentState['view'];
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    console.warn('[cron] Unable to fetch thread state before cycle update', { threadId, error: message });
  }

  const view = existingView ? { ...existingView, command: 'cycle' } : { command: 'cycle' };
  const response = await fetch(`${baseUrl}/threads/${threadId}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      values: { messages: [runMessage], view },
      as_node: 'runCommand',
    }),
  });
  if (isLangGraphBusyStatus(response.status)) {
    const payloadText = await response.text();
    console.info(`[cron] Cycle state update rejected; thread busy (thread=${threadId})`, {
      detail: payloadText,
    });
    return false;
  }
  await parseJsonResponse(response, ThreadStateUpdateResponseSchema);
  return true;
}

async function createRun(params: {
  baseUrl: string;
  threadId: string;
  graphId: string;
  durability: LangGraphDurability;
}): Promise<string | undefined> {
  const response = await fetch(`${params.baseUrl}/threads/${params.threadId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistant_id: params.graphId,
      input: null,
      config: {
        configurable: { thread_id: params.threadId },
        durability: params.durability,
      },
      metadata: { source: 'cron' },
      stream_mode: ['events', 'values', 'messages'],
      stream_resumable: true,
    }),
  });

  if (isLangGraphBusyStatus(response.status)) {
    const payloadText = await response.text();
    console.info(`[cron] Run rejected; thread busy (thread=${params.threadId})`, { detail: payloadText });
    return undefined;
  }

  const run = await parseJsonResponse(response, RunResponseSchema);
  return run.run_id;
}

async function fetchRun(baseUrl: string, threadId: string, runId: string) {
  const response = await fetch(`${baseUrl}/threads/${threadId}/runs/${runId}`);
  return parseJsonResponse(response, RunResponseSchema);
}

async function waitForRunStreamCompletion(params: {
  baseUrl: string;
  threadId: string;
  runId: string;
}): Promise<RunStatus> {
  const response = await fetch(`${params.baseUrl}/threads/${params.threadId}/runs/${params.runId}/stream`, {
    headers: {
      Accept: 'text/event-stream',
    },
  });
  if (!response.ok) {
    const payloadText = await response.text();
    throw new Error(`LangGraph run stream failed (${response.status}): ${payloadText}`);
  }

  const stream = response.body;
  if (stream) {
    for await (const chunk of stream) {
      void chunk;
    }
  }

  const run = await fetchRun(params.baseUrl, params.threadId, params.runId);
  return run.status;
}

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
  console.info(`[cron] Starting mock CLMM graph run via API (thread=${threadId})`);

  const runMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'cycle' }),
  };

  const baseUrl = resolveLangGraphDeploymentUrl();
  const graphId = resolveLangGraphGraphId();
  const defaultDurability = resolveLangGraphDefaults().durability;
  const durability = resolveLangGraphDurability(options?.durability ?? defaultDurability);

  try {
    await ensureThread(baseUrl, threadId, graphId);
    const stateUpdated = await updateCycleState(baseUrl, threadId, runMessage);
    if (!stateUpdated) {
      return;
    }
    const runId = await createRun({ baseUrl, threadId, graphId, durability });
    if (!runId) {
      return;
    }
    const status = await waitForRunStreamCompletion({ baseUrl, threadId, runId });
    if (status === 'interrupted') {
      console.warn('[cron] Graph interrupted awaiting operator input; supply input via UI and rerun.');
      return;
    }
    if (status && status !== 'success') {
      console.error('[cron] Graph run failed', { threadId, runId, status });
      return;
    }
    console.info(`[cron] Run complete in ${Date.now() - startedAt}ms`, { runId });
  } catch (error) {
    console.error('[cron] Graph run failed', error);
  } finally {
    runningThreads.delete(threadId);
  }
}

export async function startMockCron(
  threadId: string,
  options?: { durability?: LangGraphDurability },
) {
  await runGraphOnce(threadId, options);
}

configureCronExecutor(runGraphOnce);

const invokedAsEntryPoint =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedAsEntryPoint) {
  const initialThreadId = process.env['STARTER_THREAD_ID'] ?? uuidv7();
  if (!process.env['STARTER_THREAD_ID']) {
    console.info(`[cron] STARTER_THREAD_ID not provided; generated thread id ${initialThreadId}`);
  }

  await startMockCron(initialThreadId);
}
