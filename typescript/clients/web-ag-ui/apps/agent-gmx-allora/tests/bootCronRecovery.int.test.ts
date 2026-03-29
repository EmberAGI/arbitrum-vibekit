import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ScheduleThread = (threadId: string, intervalMs?: number) => unknown;

const {
  configureLangGraphApiCheckpointerMock,
  restorePersistedCronSchedulesFromCheckpointerMock,
  ensureCronForThreadMock,
  setupAgentLocalE2EMocksIfNeededMock,
} = vi.hoisted(() => ({
  configureLangGraphApiCheckpointerMock: vi.fn(async () => undefined),
  restorePersistedCronSchedulesFromCheckpointerMock: vi.fn(
    async (_scheduleThread: ScheduleThread) => [],
  ),
  ensureCronForThreadMock: vi.fn(),
  setupAgentLocalE2EMocksIfNeededMock: vi.fn(async () => undefined),
}));

vi.mock('agent-runtime-langgraph', async () => {
  const actual = await vi.importActual<typeof import('agent-runtime-langgraph')>(
    'agent-runtime-langgraph',
  );
  return {
    ...actual,
    configureLangGraphApiCheckpointer: configureLangGraphApiCheckpointerMock,
    restorePersistedCronSchedulesFromCheckpointer:
      restorePersistedCronSchedulesFromCheckpointerMock,
  };
});

vi.mock('../src/workflow/cronScheduler.js', async () => {
  const actual = await vi.importActual<typeof import('../src/workflow/cronScheduler.js')>(
    '../src/workflow/cronScheduler.js',
  );
  return {
    ...actual,
    ensureCronForThread: ensureCronForThreadMock,
    configureCronExecutor: vi.fn(),
  };
});

vi.mock('../src/e2e/agentLocalMocks.js', () => ({
  setupAgentLocalE2EMocksIfNeeded: setupAgentLocalE2EMocksIfNeededMock,
}));

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

describe('GMX Allora boot-time cron recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    configureLangGraphApiCheckpointerMock.mockReset();
    restorePersistedCronSchedulesFromCheckpointerMock.mockReset();
    ensureCronForThreadMock.mockReset();
    setupAgentLocalE2EMocksIfNeededMock.mockReset();
    configureLangGraphApiCheckpointerMock.mockResolvedValue(undefined);
    setupAgentLocalE2EMocksIfNeededMock.mockResolvedValue(undefined);
    restorePersistedCronSchedulesFromCheckpointerMock.mockImplementation(
      async (scheduleThread: ScheduleThread) => {
        await scheduleThread('thread-recovered', 15_000);
        return [{ threadId: 'thread-recovered', pollIntervalMs: 15_000 }];
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('re-schedules recovered threads when the agent boots', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);
      if (url.endsWith('/threads/thread-recovered/runs') && method === 'GET') {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await import('../src/agent.js');

    expect(setupAgentLocalE2EMocksIfNeededMock).toHaveBeenCalledTimes(1);
    expect(configureLangGraphApiCheckpointerMock).toHaveBeenCalledTimes(1);
    expect(restorePersistedCronSchedulesFromCheckpointerMock).toHaveBeenCalledTimes(1);
    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-recovered', 15_000);
  });

  it('cancels stale running runs before a recovered thread takes its next cron tick', async () => {
    let staleRunCancelled = false;

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);

      if (url.endsWith('/threads/thread-recovered/runs') && method === 'GET') {
        return jsonResponse([{ run_id: 'run-stale', status: 'running' }]);
      }
      if (url.includes('/threads/thread-recovered/runs/run-stale/cancel') && method === 'POST') {
        staleRunCancelled = true;
        return jsonResponse({ run_id: 'run-stale', status: 'cancelled' });
      }
      if (url.endsWith('/threads') && method === 'POST') {
        return jsonResponse({ thread_id: 'thread-recovered' });
      }
      if (url.endsWith('/threads/thread-recovered') && method === 'PATCH') {
        return jsonResponse({ thread_id: 'thread-recovered' });
      }
      if (url.endsWith('/threads/thread-recovered/state') && method === 'GET') {
        return jsonResponse({ values: { thread: {} } });
      }
      if (url.endsWith('/threads/thread-recovered/state') && method === 'POST') {
        return jsonResponse({ checkpoint_id: 'cp-1' });
      }
      if (url.endsWith('/threads/thread-recovered/runs') && method === 'POST') {
        if (!staleRunCancelled) {
          return new Response('Thread is busy', { status: 422 });
        }
        return jsonResponse({ run_id: 'run-fresh' });
      }
      if (url.endsWith('/threads/thread-recovered/runs/run-fresh/stream') && method === 'GET') {
        return new Response('event: done\n\n', { status: 200 });
      }
      if (url.endsWith('/threads/thread-recovered/runs/run-fresh') && method === 'GET') {
        return jsonResponse({ run_id: 'run-fresh', status: 'success' });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const agentModule = await import('../src/agent.js');
    await expect(agentModule.runGraphOnce('thread-recovered')).resolves.toBeUndefined();

    const cancelCalls = fetchMock.mock.calls.filter(([input, requestInit]) => {
      return (
        getUrl(input as string | URL | Request).includes(
          '/threads/thread-recovered/runs/run-stale/cancel',
        ) && getMethod(requestInit) === 'POST'
      );
    });
    expect(cancelCalls).toHaveLength(1);

    const cancelUrl = getUrl(cancelCalls[0]?.[0] as string | URL | Request);
    expect(cancelUrl).toContain('wait=true');

    const successfulRunStreamCalls = fetchMock.mock.calls.filter(([input, requestInit]) => {
      return (
        getUrl(input as string | URL | Request).endsWith(
          '/threads/thread-recovered/runs/run-fresh/stream',
        ) && getMethod(requestInit) === 'GET'
      );
    });
    expect(successfulRunStreamCalls).toHaveLength(1);
  });
});
