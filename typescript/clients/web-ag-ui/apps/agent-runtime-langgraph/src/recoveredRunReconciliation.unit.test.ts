import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ScheduleThread = (threadId: string, intervalMs?: number) => unknown;

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
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

describe('recoveredRunReconciliation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('cancels active recovered runs with wait=true before rescheduling', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);

      if (url.endsWith('/threads/thread-1/runs') && method === 'GET') {
        return jsonResponse([
          { run_id: 'run-pending', status: 'pending' },
          { run_id: 'run-running', status: 'running' },
          { run_id: 'run-success', status: 'success' },
        ]);
      }
      if (url.includes('/threads/thread-1/runs/run-pending/cancel') && method === 'POST') {
        return jsonResponse({ run_id: 'run-pending', status: 'cancelled' });
      }
      if (url.includes('/threads/thread-1/runs/run-running/cancel') && method === 'POST') {
        return jsonResponse({ run_id: 'run-running', status: 'cancelled' });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { reconcileRecoveredThreadRuns } = await import('./recoveredRunReconciliation.js');
    const warn = vi.fn();

    const runs = await reconcileRecoveredThreadRuns('http://localhost:8126', 'thread-1', { warn });

    expect(runs.map((run) => run.run_id)).toEqual(['run-pending', 'run-running']);
    expect(warn).toHaveBeenCalledTimes(1);

    const cancelCalls = fetchMock.mock.calls.filter(([input, requestInit]) => {
      return getUrl(input as string | URL | Request).includes('/cancel') && getMethod(requestInit) === 'POST';
    });
    expect(cancelCalls).toHaveLength(2);
    for (const [input] of cancelCalls) {
      expect(getUrl(input as string | URL | Request)).toContain('wait=true');
    }
  });

  it('supports object-wrapped run list responses', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);
      if (url.endsWith('/threads/thread-1/runs') && method === 'GET') {
        return jsonResponse({ runs: [{ run_id: 'run-1', status: 'running' }] });
      }
      if (url.includes('/threads/thread-1/runs/run-1/cancel') && method === 'POST') {
        return jsonResponse({ run_id: 'run-1', status: 'cancelled' });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { reconcileRecoveredThreadRuns } = await import('./recoveredRunReconciliation.js');

    const runs = await reconcileRecoveredThreadRuns('http://localhost:8126', 'thread-1');

    expect(runs).toHaveLength(1);
    expect(runs[0]?.run_id).toBe('run-1');
  });

  it('restores cron threads after reconciliation and continues on reconciliation failure', async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: unknown) => {
      const url = getUrl(input);
      const method = getMethod(init);

      if (url.endsWith('/threads/thread-1/runs') && method === 'GET') {
        return jsonResponse([{ run_id: 'run-1', status: 'running' }]);
      }
      if (url.includes('/threads/thread-1/runs/run-1/cancel') && method === 'POST') {
        return jsonResponse({ run_id: 'run-1', status: 'cancelled' });
      }
      if (url.endsWith('/threads/thread-2/runs') && method === 'GET') {
        return new Response('boom', { status: 500 });
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { restorePersistedCronSchedulesWithRunReconciliation } = await import(
      './recoveredRunReconciliation.js'
    );
    const scheduleThread = vi.fn<ScheduleThread>();
    const logger = { warn: vi.fn() };
    const loadCheckpointer = vi.fn(() =>
      Promise.resolve({
        storage: {
          'thread-1': {
            '': {
              checkpoint: [
                Buffer.from(
                  JSON.stringify({
                    ts: '2026-03-29T17:00:00.000Z',
                    channel_values: {
                      private: { bootstrapped: true, pollIntervalMs: 60_000, cronScheduled: true },
                      thread: {
                        lifecycle: { phase: 'active' },
                        operatorConfig: { walletAddress: '0x1111111111111111111111111111111111111111' },
                        selectedPool: { address: '0xpool-1' },
                      },
                    },
                  }),
                ).toString('base64'),
                '{}',
                '',
              ],
            },
          },
          'thread-2': {
            '': {
              checkpoint: [
                Buffer.from(
                  JSON.stringify({
                    ts: '2026-03-29T17:01:00.000Z',
                    channel_values: {
                      private: { bootstrapped: true, pollIntervalMs: 30_000, cronScheduled: true },
                      thread: {
                        lifecycle: { phase: 'active' },
                        operatorConfig: { walletAddress: '0x2222222222222222222222222222222222222222' },
                        selectedPool: { address: '0xpool-2' },
                      },
                    },
                  }),
                ).toString('base64'),
                '{}',
                '',
              ],
            },
          },
        },
      }),
    );

    const recovered = await restorePersistedCronSchedulesWithRunReconciliation({
      baseUrl: 'http://localhost:8126',
      scheduleThread,
      logger,
      loadCheckpointer,
    });

    expect(recovered).toEqual([
      { threadId: 'thread-1', pollIntervalMs: 60_000 },
      { threadId: 'thread-2', pollIntervalMs: 30_000 },
    ]);
    expect(scheduleThread).toHaveBeenCalledTimes(2);
    expect(scheduleThread).toHaveBeenCalledWith('thread-1', 60_000);
    expect(scheduleThread).toHaveBeenCalledWith('thread-2', 30_000);
    expect(logger.warn).toHaveBeenCalledWith('[cron] Failed to reconcile recovered thread runs', {
      threadId: 'thread-2',
      error: 'LangGraph API request failed (500): boom',
    });
  });
});
