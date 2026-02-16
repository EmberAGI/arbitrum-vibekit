import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

const resolveBaseUrl = (): string => {
  const raw = process.env['LANGGRAPH_DEPLOYMENT_URL'] ?? 'http://localhost:8124';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
};

const resolveGraphId = (): string => process.env['LANGGRAPH_GRAPH_ID'] ?? 'agent-clmm';

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LangGraph API request failed (${response.status}): ${text}`);
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
};

const createThread = async (baseUrl: string, threadId: string) => {
  const response = await fetch(`${baseUrl}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thread_id: threadId, if_exists: 'do_nothing' }),
  });
  return parseJson(response);
};

const createRun = async (params: {
  baseUrl: string;
  threadId: string;
  graphId: string;
  command: 'fire';
}) => {
  const response = await fetch(`${params.baseUrl}/threads/${params.threadId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistant_id: params.graphId,
      input: {
        messages: [
          {
            id: uuidv7(),
            role: 'user',
            content: JSON.stringify({ command: params.command }),
          },
        ],
      },
      config: { configurable: { thread_id: params.threadId } },
      metadata: { source: 'e2e' },
      stream_mode: ['events', 'values', 'messages'],
      stream_resumable: true,
    }),
  });
  const payload = await parseJson(response);
  const runId = payload['run_id'];
  if (typeof runId !== 'string') {
    throw new Error(`Expected run_id string, received: ${JSON.stringify(payload)}`);
  }
  return runId;
};

const fetchRunStatus = async (baseUrl: string, threadId: string, runId: string) => {
  const response = await fetch(`${baseUrl}/threads/${threadId}/runs/${runId}`);
  const payload = await parseJson(response);
  const status = payload['status'];
  return typeof status === 'string' ? status : undefined;
};

const waitForTerminalStatus = async (params: {
  baseUrl: string;
  threadId: string;
  runId: string;
  timeoutMs?: number;
}) => {
  const timeout = params.timeoutMs ?? 45_000;
  const terminal = new Set(['completed', 'success', 'failed', 'error', 'cancelled']);
  const started = Date.now();
  let status = await fetchRunStatus(params.baseUrl, params.threadId, params.runId);
  while (!status || !terminal.has(status)) {
    if (Date.now() - started > timeout) {
      throw new Error(`Timed out waiting for run status. Last status: ${status ?? 'unknown'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    status = await fetchRunStatus(params.baseUrl, params.threadId, params.runId);
  }
  return status;
};

const baseUrl = resolveBaseUrl();
const graphId = resolveGraphId();

describe('agent-clmm e2e', () => {
  const shouldRun = process.env['CLMM_E2E'] === 'true' && Boolean(process.env['LANGGRAPH_DEPLOYMENT_URL']);
  const testFn = shouldRun ? it : it.skip;

  testFn('runs a fire command through the LangGraph API endpoint', async () => {
    const threadId = uuidv7();
    await createThread(baseUrl, threadId);
    const runId = await createRun({ baseUrl, threadId, graphId, command: 'fire' });
    const status = await waitForTerminalStatus({
      baseUrl,
      threadId,
      runId,
    });

    expect(['completed', 'success']).toContain(status);
  });
});
