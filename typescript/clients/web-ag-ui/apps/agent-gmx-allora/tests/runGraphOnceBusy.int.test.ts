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

describe('runGraphOnce busy handling integration (GMX Allora)', () => {
  beforeEach(() => {
    delete process.env['LANGGRAPH_DEPLOYMENT_URL'];
    delete process.env['LANGGRAPH_GRAPH_ID'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns early when cycle state update is rejected as busy', async () => {
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

  it('normalizes stale onboarding input-required task state when projecting cycle command to thread state', async () => {
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
        return jsonResponse({
          values: {
            view: {
              command: 'hire',
              onboardingFlow: {
                status: 'completed',
                revision: 5,
                steps: [
                  { id: 'setup', title: 'Strategy Config', status: 'completed' },
                  { id: 'delegation-signing', title: 'Delegation Signing', status: 'completed' },
                ],
              },
              task: {
                id: 'task-1',
                taskStatus: {
                  state: 'input-required',
                  message: { content: 'Waiting for delegation approval to continue onboarding.' },
                },
              },
            },
          },
        });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'POST') {
        if (!init || typeof init !== 'object' || !('body' in init)) {
          throw new Error('Missing request body');
        }
        const bodyText = (init as { body?: unknown }).body;
        if (typeof bodyText !== 'string') {
          throw new Error('Expected string request body');
        }
        const body = JSON.parse(bodyText) as {
          values?: { view?: { task?: { taskStatus?: { state?: string } } } };
        };
        expect(body.values?.view?.task?.taskStatus?.state).toBe('working');
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
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
