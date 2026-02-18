import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runGraphOnce } from '../src/agent.js';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getMethod(init?: unknown): string {
  if (typeof init !== 'object' || init === null) {
    return 'GET';
  }
  if (!('method' in init)) {
    return 'GET';
  }
  const method = (init as { method?: unknown }).method;
  return typeof method === 'string' ? method : 'GET';
}

function getUrl(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input.toString();
}

describe('runGraphOnce integration', () => {
  beforeEach(() => {
    delete process.env['LANGGRAPH_DEPLOYMENT_URL'];
    delete process.env['LANGGRAPH_GRAPH_ID'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns early when thread state update is rejected as busy', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);

      if (url.endsWith('/threads') && method === 'POST') {
        return jsonResponse({ thread_id: 'thread-1' });
      }
      if (url.endsWith('/threads/thread-1') && method === 'PATCH') {
        return jsonResponse({ thread_id: 'thread-1' });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'GET') {
        return jsonResponse({ values: { view: {} } });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'POST') {
        return new Response('busy', { status: 409 });
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runGraphOnce('thread-1')).resolves.toBeUndefined();

    const runCreateCalls = fetchMock.mock.calls.filter(([input]) =>
      getUrl(input as string | URL | Request).includes('/threads/thread-1/runs'),
    );
    expect(runCreateCalls).toHaveLength(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('returns early when run creation is rejected as busy', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);

      if (url.endsWith('/threads') && method === 'POST') {
        return jsonResponse({ thread_id: 'thread-1' });
      }
      if (url.endsWith('/threads/thread-1') && method === 'PATCH') {
        return jsonResponse({ thread_id: 'thread-1' });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'GET') {
        return jsonResponse({ values: { view: {} } });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'POST') {
        return jsonResponse({ checkpoint_id: 'cp-1' });
      }
      if (url.endsWith('/threads/thread-1/runs') && method === 'POST') {
        return new Response('busy', { status: 422 });
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runGraphOnce('thread-1')).resolves.toBeUndefined();

    const runStreamCalls = fetchMock.mock.calls.filter(([input]) =>
      getUrl(input as string | URL | Request).includes('/runs/') &&
      getUrl(input as string | URL | Request).endsWith('/stream'),
    );
    expect(runStreamCalls).toHaveLength(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('completes successfully when state update and run creation succeed', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);

      if (url.endsWith('/threads') && method === 'POST') {
        return jsonResponse({ thread_id: 'thread-1' });
      }
      if (url.endsWith('/threads/thread-1') && method === 'PATCH') {
        return jsonResponse({ thread_id: 'thread-1' });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'GET') {
        return jsonResponse({ values: { view: {} } });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'POST') {
        return jsonResponse({ checkpoint_id: 'cp-1' });
      }
      if (url.endsWith('/threads/thread-1/runs') && method === 'POST') {
        return jsonResponse({ run_id: 'run-1' });
      }
      if (url.endsWith('/threads/thread-1/runs/run-1/stream') && method === 'GET') {
        return new Response('event: done\n\n', { status: 200 });
      }
      if (url.endsWith('/threads/thread-1/runs/run-1') && method === 'GET') {
        return jsonResponse({ run_id: 'run-1', status: 'success' });
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(runGraphOnce('thread-1')).resolves.toBeUndefined();

    const runCreateCalls = fetchMock.mock.calls.filter(([input]) =>
      getUrl(input as string | URL | Request).endsWith('/threads/thread-1/runs'),
    );
    const runStreamCalls = fetchMock.mock.calls.filter(([input]) =>
      getUrl(input as string | URL | Request).endsWith('/threads/thread-1/runs/run-1/stream'),
    );
    const runFetchCalls = fetchMock.mock.calls.filter(([input]) =>
      getUrl(input as string | URL | Request).endsWith('/threads/thread-1/runs/run-1'),
    );
    expect(runCreateCalls).toHaveLength(1);
    expect(runStreamCalls).toHaveLength(1);
    expect(runFetchCalls).toHaveLength(1);
  });
});
