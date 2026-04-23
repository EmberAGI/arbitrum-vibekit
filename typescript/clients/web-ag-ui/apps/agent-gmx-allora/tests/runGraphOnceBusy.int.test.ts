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
        return jsonResponse({ values: { thread: {} } });
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
          values?: {
            messages?: unknown[];
            private?: {
              pendingCommand?: {
                command?: string;
              };
            };
          };
        };
        expect(body.values?.private?.pendingCommand?.command).toBe('cycle');
        expect(body.values?.messages).toBeUndefined();
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
        return jsonResponse({ values: { thread: {} } });
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
          values?: {
            messages?: unknown[];
            private?: {
              pendingCommand?: {
                command?: string;
              };
            };
          };
        };
        expect(body.values?.private?.pendingCommand?.command).toBe('cycle');
        expect(body.values?.messages).toBeUndefined();
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
            thread: {
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
          values?: {
            messages?: unknown[];
            private?: {
              pendingCommand?: {
                command?: string;
              };
            };
            thread?: { task?: { taskStatus?: { state?: string } } };
          };
        };
        expect(body.values?.private?.pendingCommand?.command).toBe('cycle');
        expect(body.values?.messages).toBeUndefined();
        expect(body.values?.thread?.task?.taskStatus?.state).toBe('working');
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

  it('creates non-resumable streams for successful runs', async () => {
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
        return jsonResponse({ values: { thread: {} } });
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
          values?: {
            messages?: unknown[];
            private?: {
              pendingCommand?: {
                command?: string;
              };
            };
          };
        };
        expect(body.values?.private?.pendingCommand?.command).toBe('cycle');
        expect(body.values?.messages).toBeUndefined();
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

    const runCreateCall = fetchMock.mock.calls.find(([input]) =>
      getUrl(input as string | URL | Request).endsWith('/threads/thread-1/runs'),
    );
    expect(runCreateCall).toBeDefined();
    const runCreateInit = runCreateCall?.[1];
    if (!runCreateInit || typeof runCreateInit !== 'object' || !('body' in runCreateInit)) {
      throw new Error('Missing run create request body');
    }
    const bodyText = (runCreateInit as { body?: unknown }).body;
    if (typeof bodyText !== 'string') {
      throw new Error('Expected string run create request body');
    }
    const body = JSON.parse(bodyText) as { stream_resumable?: boolean };
    expect(body.stream_resumable).toBe(false);
  });

  it('recovers when a cron run stream hangs and allows the next tick to proceed', async () => {
    process.env['LANGGRAPH_RUN_STREAM_TIMEOUT_MS'] = '10';
    let runCounter = 0;

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
        return jsonResponse({ values: { thread: {} } });
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
          values?: {
            messages?: unknown[];
            private?: {
              pendingCommand?: {
                command?: string;
              };
            };
          };
        };
        expect(body.values?.private?.pendingCommand?.command).toBe('cycle');
        expect(body.values?.messages).toBeUndefined();
        return jsonResponse({ checkpoint_id: 'cp-1' });
      }
      if (url.endsWith('/threads/thread-1/runs') && method === 'POST') {
        runCounter += 1;
        return jsonResponse({ run_id: `run-${runCounter}` });
      }
      if (url.endsWith('/threads/thread-1/runs/run-1/stream') && method === 'GET') {
        return new Response(
          new ReadableStream({
            start() {
              // Intentionally never closes to simulate the wedged cron run we saw live.
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/threads/thread-1/runs/run-1/cancel') && method === 'POST') {
        return new Response('', { status: 202 });
      }
      if (url.endsWith('/threads/thread-1/runs/run-1') && method === 'GET') {
        return jsonResponse({ run_id: 'run-1', status: 'cancelled' });
      }
      if (url.endsWith('/threads/thread-1/runs/run-2/stream') && method === 'GET') {
        return new Response('event: done\n\n', { status: 200 });
      }
      if (url.endsWith('/threads/thread-1/runs/run-2') && method === 'GET') {
        return jsonResponse({ run_id: 'run-2', status: 'success' });
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    };

    await expect(withTimeout(runGraphOnce('thread-1'), 250)).resolves.toBeUndefined();
    await expect(withTimeout(runGraphOnce('thread-1'), 250)).resolves.toBeUndefined();

    const cancelCalls = fetchMock.mock.calls.filter(([input, requestInit]) => {
      return (
        getUrl(input as string | URL | Request).includes('/threads/thread-1/runs/run-1/cancel') &&
        getMethod(requestInit) === 'POST'
      );
    });
    expect(cancelCalls).toHaveLength(1);
    expect(getUrl(cancelCalls[0]?.[0] as string | URL | Request)).toContain('wait=true');

    const runCreateCalls = fetchMock.mock.calls.filter(([input, requestInit]) => {
      return (
        getUrl(input as string | URL | Request).endsWith('/threads/thread-1/runs') &&
        getMethod(requestInit) === 'POST'
      );
    });
    expect(runCreateCalls).toHaveLength(2);
  });

  it('recovers even when stream cleanup cancel never resolves', async () => {
    process.env['LANGGRAPH_RUN_STREAM_TIMEOUT_MS'] = '10';
    let runCounter = 0;

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
        return jsonResponse({ values: { thread: {} } });
      }
      if (url.endsWith('/threads/thread-1/state') && method === 'POST') {
        return jsonResponse({ checkpoint_id: 'cp-1' });
      }
      if (url.endsWith('/threads/thread-1/runs') && method === 'POST') {
        runCounter += 1;
        return jsonResponse({ run_id: `run-${runCounter}` });
      }
      if (url.endsWith('/threads/thread-1/runs/run-1/stream') && method === 'GET') {
        return new Response(
          new ReadableStream({
            start() {
              // Never emit or close.
            },
            cancel() {
              return new Promise(() => undefined);
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes('/threads/thread-1/runs/run-1/cancel') && method === 'POST') {
        return new Response('', { status: 202 });
      }
      if (url.endsWith('/threads/thread-1/runs/run-1') && method === 'GET') {
        return jsonResponse({ run_id: 'run-1', status: 'cancelled' });
      }
      if (url.endsWith('/threads/thread-1/runs/run-2/stream') && method === 'GET') {
        return new Response('event: done\n\n', { status: 200 });
      }
      if (url.endsWith('/threads/thread-1/runs/run-2') && method === 'GET') {
        return jsonResponse({ run_id: 'run-2', status: 'success' });
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    };

    await expect(withTimeout(runGraphOnce('thread-1'), 250)).resolves.toBeUndefined();
    await expect(withTimeout(runGraphOnce('thread-1'), 250)).resolves.toBeUndefined();

    const cancelCalls = fetchMock.mock.calls.filter(([input, requestInit]) => {
      return (
        getUrl(input as string | URL | Request).includes('/threads/thread-1/runs/run-1/cancel') &&
        getMethod(requestInit) === 'POST'
      );
    });
    expect(cancelCalls).toHaveLength(1);
    expect(getUrl(cancelCalls[0]?.[0] as string | URL | Request)).toContain('wait=true');

    const runCreateCalls = fetchMock.mock.calls.filter(([input, requestInit]) => {
      return (
        getUrl(input as string | URL | Request).endsWith('/threads/thread-1/runs') &&
        getMethod(requestInit) === 'POST'
      );
    });
    expect(runCreateCalls).toHaveLength(2);
  });

  it('preserves inactive lifecycle for fire-terminal snapshots even when setup signals persist', async () => {
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
            thread: {
              lifecycle: { phase: 'inactive' },
              command: 'fire',
              operatorConfig: {
                delegateeWalletAddress: '0x1111111111111111111111111111111111111111',
              },
              task: {
                id: 'task-fire',
                taskStatus: {
                  state: 'completed',
                  message: { content: 'Agent fired. Workflow completed.' },
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
          values?: {
            messages?: unknown[];
            private?: {
              pendingCommand?: {
                command?: string;
              };
            };
            thread?: { lifecycle?: { phase?: string }; task?: { taskStatus?: { state?: string } } };
          };
        };
        expect(body.values?.private?.pendingCommand?.command).toBe('cycle');
        expect(body.values?.messages).toBeUndefined();
        expect(body.values?.thread?.lifecycle?.phase).toBe('inactive');
        expect(body.values?.thread?.task?.taskStatus?.state).toBe('completed');
        return jsonResponse({ checkpoint_id: 'cp-1' });
      }
      if (url.endsWith('/threads/thread-1/runs') && method === 'POST') {
        return new Response('busy', { status: 422 });
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(runGraphOnce('thread-1')).resolves.toBeUndefined();
  });
});
