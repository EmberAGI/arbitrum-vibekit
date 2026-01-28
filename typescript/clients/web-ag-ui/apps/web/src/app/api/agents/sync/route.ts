import { NextRequest, NextResponse } from 'next/server';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

import { getAgentThreadId } from '@/utils/agentThread';

const BodySchema = z.object({
  agentId: z.string().min(1),
  threadId: z.string().optional(),
});

const RunResponseSchema = z
  .object({
    run_id: z.string(),
    status: z.string().optional(),
  })
  .catchall(z.unknown());

const ThreadStateSchema = z
  .object({
    view: z
      .object({
        profile: z.record(z.unknown()).optional(),
        metrics: z.record(z.unknown()).optional(),
      })
      .optional(),
  })
  .catchall(z.unknown());

type RunResponse = z.infer<typeof RunResponseSchema>;
type ThreadState = z.infer<typeof ThreadStateSchema>;

type AgentRuntimeConfig = {
  deploymentUrl: string;
  graphId: string;
};

const AGENT_RUNTIME_CONFIGS: Record<string, AgentRuntimeConfig> = {
  'agent-clmm': {
    deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
    graphId: 'agent-clmm',
  },
  starterAgent: {
    deploymentUrl: 'http://localhost:8123',
    graphId: 'starterAgent',
  },
};

function resolveAgentRuntime(agentId: string): AgentRuntimeConfig | null {
  return AGENT_RUNTIME_CONFIGS[agentId] ?? null;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function extractThreadStateValues(payload: unknown): Record<string, unknown> | null {
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
): Promise<Record<string, unknown> | null> {
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
  await parseJsonResponse(response, z.object({ thread_id: z.string() }).catchall(z.unknown()));

  const patchResponse = await fetch(`${baseUrl}/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata }),
  });
  await parseJsonResponse(patchResponse, z.object({ thread_id: z.string() }).catchall(z.unknown()));
}

async function updateSyncState(baseUrl: string, threadId: string) {
  const runMessage = {
    id: uuidv7(),
    role: 'user' as const,
    content: JSON.stringify({ command: 'sync' }),
  };

  let existingView: Record<string, unknown> | null = null;
  try {
    const currentState = await fetchThreadStateValues(baseUrl, threadId);
    if (currentState && isRecord(currentState['view'])) {
      existingView = currentState['view'];
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    console.warn('[agent-sync] Unable to fetch thread state before sync', { threadId, error: message });
  }

  const view = existingView ? { ...existingView, command: 'sync' } : { command: 'sync' };
  const response = await fetch(`${baseUrl}/threads/${threadId}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      values: { messages: [runMessage], view },
      as_node: 'runCommand',
    }),
  });
  await parseJsonResponse(
    response,
    z.object({ checkpoint_id: z.string().optional() }).catchall(z.unknown()),
  );
}

async function createRun(baseUrl: string, threadId: string, graphId: string): Promise<RunResponse> {
  const response = await fetch(`${baseUrl}/threads/${threadId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistant_id: graphId,
      input: null,
      config: {
        configurable: { thread_id: threadId },
        durability: 'exit',
      },
      metadata: { source: 'list-sync' },
      stream_mode: ['values'],
      stream_resumable: true,
    }),
  });
  return parseJsonResponse(response, RunResponseSchema);
}

const RUN_IN_PROGRESS = new Set(['pending', 'queued', 'running']);

async function waitForRunCompletion(baseUrl: string, threadId: string, runId: string) {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${baseUrl}/threads/${threadId}/runs/${runId}`);
    const run = await parseJsonResponse(response, RunResponseSchema);
    const status = run.status?.toLowerCase() ?? '';
    if (!RUN_IN_PROGRESS.has(status)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.warn('[agent-sync] Run did not complete before timeout', { threadId, runId });
}

async function fetchViewState(baseUrl: string, threadId: string): Promise<ThreadState | null> {
  const values = await fetchThreadStateValues(baseUrl, threadId);
  if (!values) {
    return null;
  }
  const parsed = ThreadStateSchema.safeParse(values);
  if (!parsed.success) {
    console.warn('[agent-sync] Unable to parse thread state', { threadId, error: parsed.error.message });
    return null;
  }
  return parsed.data;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.message },
      { status: 400 },
    );
  }

  const runtime = resolveAgentRuntime(parsed.data.agentId);
  if (!runtime) {
    return NextResponse.json({ error: 'Unknown agent', agentId: parsed.data.agentId }, { status: 404 });
  }

  const baseUrl = normalizeBaseUrl(runtime.deploymentUrl);
  const threadId = parsed.data.threadId ?? getAgentThreadId(parsed.data.agentId);

  try {
    await ensureThread(baseUrl, threadId, runtime.graphId);
    await updateSyncState(baseUrl, threadId);
    const run = await createRun(baseUrl, threadId, runtime.graphId);
    await waitForRunCompletion(baseUrl, threadId, run.run_id);
    const state = await fetchViewState(baseUrl, threadId);

    return NextResponse.json(
      {
        agentId: parsed.data.agentId,
        profile: state?.view?.profile ?? null,
        metrics: state?.view?.metrics ?? null,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[agent-sync] Sync failed', { agentId: parsed.data.agentId, error: message });
    return NextResponse.json(
      { error: 'Sync failed', details: message },
      { status: 500 },
    );
  }
}
