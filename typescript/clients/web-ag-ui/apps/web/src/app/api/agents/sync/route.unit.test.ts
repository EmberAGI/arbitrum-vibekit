import { describe, expect, it, vi } from 'vitest';

import { POST } from './route';

type FetchCall = { url: string; init?: RequestInit };

function createJsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function createTextResponse(payload: string, init?: ResponseInit): Response {
  return new Response(payload, { status: 200, ...init });
}

function extractJsonBody(init?: RequestInit): unknown {
  if (!init?.body) {
    return null;
  }
  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body);
    } catch {
      return init.body;
    }
  }
  return init.body;
}

function makeRequestJson(payload: unknown): { json: () => Promise<unknown> } {
  return {
    json: async () => payload,
  };
}

function makeThreadState(params: {
  hasInterrupts: boolean;
  hasView: boolean;
  taskState?: string;
  command?: string;
  taskMessage?: string;
  setupComplete?: boolean;
}): unknown {
  const tasks = params.hasInterrupts
    ? [{ interrupts: [{ value: { type: 'pendle-setup-request' } }] }]
    : [{ interrupts: [] }];

  const task = params.taskState
    ? {
        id: 'task-1',
        taskStatus: {
          state: params.taskState,
          ...(params.taskMessage ? { message: { content: params.taskMessage } } : {}),
        },
      }
    : undefined;

  const values = params.hasView
      ? {
          view: {
            command: params.command,
            setupComplete: params.setupComplete,
            task,
            profile: { apy: 1 },
            metrics: { iteration: 0 },
        },
      }
    : {};

  return { values, tasks };
}

function makeFetchMock(respond: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const call = { url, init };
    calls.push(call);
    return respond(call);
  });
  return { fn, calls };
}

function didCallSyncStateMutation(calls: FetchCall[]): boolean {
  return calls.some((call) => {
    if (call.init?.method !== 'POST') {
      return false;
    }
    if (!call.url.includes('/threads/') || !call.url.endsWith('/state')) {
      return false;
    }
    const body = extractJsonBody(call.init);
    if (typeof body !== 'object' || body === null) {
      return false;
    }
    const values = (body as Record<string, unknown>)['values'];
    if (typeof values !== 'object' || values === null) {
      return false;
    }
    const messages = (values as Record<string, unknown>)['messages'];
    if (!Array.isArray(messages) || messages.length === 0) {
      return false;
    }
    const first = messages[0];
    if (typeof first !== 'object' || first === null) {
      return false;
    }
    const content = (first as Record<string, unknown>)['content'];
    if (typeof content !== 'string') {
      return false;
    }
    try {
      const parsed = JSON.parse(content) as unknown;
      return (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as Record<string, unknown>)['command'] === 'sync'
      );
    } catch {
      return false;
    }
  });
}

describe('POST /api/agents/sync', () => {
  it('does not mutate state or start a run when there is a pending interrupt', async () => {
    const threadId = 'thread-with-interrupt';
    const agentId = 'agent-pendle';

    const initial = makeThreadState({ hasInterrupts: true, hasView: true, taskState: 'submitted' });

    const fetchMock = makeFetchMock((call) => {
      if (call.url.endsWith(`/threads/${threadId}/state`) && (!call.init || call.init.method === 'GET')) {
        return createJsonResponse(initial);
      }
      throw new Error(`Unexpected fetch: ${call.init?.method ?? 'GET'} ${call.url}`);
    });

    vi.stubGlobal('fetch', fetchMock.fn);
    try {
      const res = await POST(makeRequestJson({ agentId, threadId }) as never);
      expect(res.status).toBe(200);

      const payload = (await res.json()) as unknown;
      expect(payload).toEqual(
        expect.objectContaining({
          agentId,
          taskState: 'submitted',
        }),
      );

      expect(didCallSyncStateMutation(fetchMock.calls)).toBe(false);
      expect(fetchMock.calls.some((c) => c.url.includes(`/threads/${threadId}/runs`))).toBe(false);
      expect(fetchMock.calls.some((c) => c.url.endsWith('/threads') && c.init?.method === 'POST')).toBe(false);
      expect(fetchMock.calls.some((c) => c.url.endsWith(`/threads/${threadId}`) && c.init?.method === 'PATCH')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('mutates state and starts a run only when there is no view and no pending interrupt', async () => {
    const threadId = 'empty-thread';
    const agentId = 'agent-pendle';

    const initial = makeThreadState({ hasInterrupts: false, hasView: false });
    const afterPoke = makeThreadState({ hasInterrupts: false, hasView: true, taskState: 'submitted' });

    let stateReads = 0;

    const fetchMock = makeFetchMock((call) => {
      if (call.url.endsWith(`/threads/${threadId}/state`) && (!call.init || call.init.method === 'GET')) {
        stateReads += 1;
        return createJsonResponse(stateReads === 1 ? initial : afterPoke);
      }
      if (call.url.endsWith(`/threads/${threadId}/state`) && call.init?.method === 'POST') {
        return createJsonResponse({ checkpoint_id: 'chk-1' });
      }
      if (call.url.endsWith(`/threads/${threadId}/runs`) && call.init?.method === 'POST') {
        return createJsonResponse({ run_id: 'run-1', status: 'success' });
      }
      if (call.url.endsWith(`/threads/${threadId}/runs/run-1`) && (!call.init || call.init.method === 'GET')) {
        return createJsonResponse({ run_id: 'run-1', status: 'success' });
      }
      throw new Error(`Unexpected fetch: ${call.init?.method ?? 'GET'} ${call.url}`);
    });

    vi.stubGlobal('fetch', fetchMock.fn);
    try {
      const res = await POST(makeRequestJson({ agentId, threadId }) as never);
      expect(res.status).toBe(200);

      expect(didCallSyncStateMutation(fetchMock.calls)).toBe(true);
      expect(fetchMock.calls.some((c) => c.url.includes(`/threads/${threadId}/runs`))).toBe(true);
      expect(fetchMock.calls.some((c) => c.url.endsWith('/threads') && c.init?.method === 'POST')).toBe(false);
      expect(fetchMock.calls.some((c) => c.url.endsWith(`/threads/${threadId}`) && c.init?.method === 'PATCH')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('creates the thread only when it does not exist', async () => {
    const threadId = 'missing-thread';
    const agentId = 'agent-pendle';

    const afterCreate = makeThreadState({ hasInterrupts: false, hasView: true, taskState: 'submitted' });

    let stateReads = 0;

    const fetchMock = makeFetchMock((call) => {
      if (call.url.endsWith(`/threads/${threadId}/state`) && (!call.init || call.init.method === 'GET')) {
        stateReads += 1;
        if (stateReads === 1) {
          return createTextResponse('not found', { status: 404 });
        }
        return createJsonResponse(afterCreate);
      }
      if (call.url.endsWith('/threads') && call.init?.method === 'POST') {
        return createJsonResponse({ thread_id: threadId });
      }
      if (call.url.endsWith(`/threads/${threadId}`) && call.init?.method === 'PATCH') {
        return createJsonResponse({ thread_id: threadId });
      }
      throw new Error(`Unexpected fetch: ${call.init?.method ?? 'GET'} ${call.url}`);
    });

    vi.stubGlobal('fetch', fetchMock.fn);
    try {
      const res = await POST(makeRequestJson({ agentId, threadId }) as never);
      expect(res.status).toBe(200);

      expect(fetchMock.calls.some((c) => c.url.endsWith('/threads') && c.init?.method === 'POST')).toBe(
        true,
      );
      expect(fetchMock.calls.some((c) => c.url.endsWith(`/threads/${threadId}`) && c.init?.method === 'PATCH')).toBe(
        true,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("treats fire interrupt/abort failures as 'completed' so the UI shows Completed", async () => {
    const threadId = 'fire-interrupt-thread';
    const agentId = 'agent-pendle';

    const initial = makeThreadState({
      hasInterrupts: false,
      hasView: true,
      command: 'fire',
      taskState: 'failed',
      taskMessage: 'Error: interrupt',
    });

    const fetchMock = makeFetchMock((call) => {
      if (call.url.endsWith(`/threads/${threadId}/state`) && (!call.init || call.init.method === 'GET')) {
        return createJsonResponse(initial);
      }
      throw new Error(`Unexpected fetch: ${call.init?.method ?? 'GET'} ${call.url}`);
    });

    vi.stubGlobal('fetch', fetchMock.fn);
    try {
      const res = await POST(makeRequestJson({ agentId, threadId }) as never);
      expect(res.status).toBe(200);

      const payload = (await res.json()) as unknown;
      expect(payload).toEqual(
        expect.objectContaining({
          agentId,
          command: 'fire',
          taskState: 'completed',
          taskMessage: 'Error: interrupt',
        }),
      );

      expect(didCallSyncStateMutation(fetchMock.calls)).toBe(false);
      expect(fetchMock.calls.some((c) => c.url.includes(`/threads/${threadId}/runs`))).toBe(false);
      expect(fetchMock.calls.some((c) => c.url.endsWith('/threads') && c.init?.method === 'POST')).toBe(false);
      expect(fetchMock.calls.some((c) => c.url.endsWith(`/threads/${threadId}`) && c.init?.method === 'PATCH')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns setupComplete from view state when present', async () => {
    const threadId = 'setup-complete-thread';
    const agentId = 'agent-pendle';

    const initial = makeThreadState({
      hasInterrupts: false,
      hasView: true,
      command: 'hire',
      taskState: 'working',
      setupComplete: true,
    });

    const fetchMock = makeFetchMock((call) => {
      if (call.url.endsWith(`/threads/${threadId}/state`) && (!call.init || call.init.method === 'GET')) {
        return createJsonResponse(initial);
      }
      throw new Error(`Unexpected fetch: ${call.init?.method ?? 'GET'} ${call.url}`);
    });

    vi.stubGlobal('fetch', fetchMock.fn);
    try {
      const res = await POST(makeRequestJson({ agentId, threadId }) as never);
      expect(res.status).toBe(200);

      const payload = (await res.json()) as unknown;
      expect(payload).toEqual(
        expect.objectContaining({
          agentId,
          setupComplete: true,
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
