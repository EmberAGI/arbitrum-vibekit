import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RestoreParams = {
  baseUrl: string;
  scheduleThread: (threadId: string, intervalMs?: number) => unknown;
};

const {
  configureLangGraphApiCheckpointerMock,
  restorePersistedCronSchedulesWithRunReconciliationMock,
  ensureCronForThreadMock,
} = vi.hoisted(() => ({
  configureLangGraphApiCheckpointerMock: vi.fn(() => Promise.resolve(undefined)),
  restorePersistedCronSchedulesWithRunReconciliationMock: vi.fn((params: RestoreParams) => {
    void params;
    return Promise.resolve([]);
  }),
  ensureCronForThreadMock: vi.fn(),
}));

vi.mock('agent-runtime-langgraph', async () => {
  const actual = await vi.importActual('agent-runtime-langgraph');
  return {
    ...actual,
    configureLangGraphApiCheckpointer: configureLangGraphApiCheckpointerMock,
    restorePersistedCronSchedulesWithRunReconciliation:
      restorePersistedCronSchedulesWithRunReconciliationMock,
  };
});

vi.mock('./workflow/cronScheduler.js', async () => {
  const actual = await vi.importActual('./workflow/cronScheduler.js');
  return {
    ...actual,
    ensureCronForThread: ensureCronForThreadMock,
    configureCronExecutor: vi.fn(),
  };
});

describe('Pendle boot-time cron recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    configureLangGraphApiCheckpointerMock.mockReset();
    restorePersistedCronSchedulesWithRunReconciliationMock.mockReset();
    ensureCronForThreadMock.mockReset();
    configureLangGraphApiCheckpointerMock.mockResolvedValue(undefined);
    restorePersistedCronSchedulesWithRunReconciliationMock.mockImplementation(
      async ({ scheduleThread }: RestoreParams) => {
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
    await import('./agent.js');

    expect(configureLangGraphApiCheckpointerMock).toHaveBeenCalledTimes(1);
    expect(restorePersistedCronSchedulesWithRunReconciliationMock).toHaveBeenCalledTimes(1);
    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-recovered', 15_000);
  });

  it('delegates recovered run reconciliation to the shared helper with the agent scheduler', async () => {
    await import('./agent.js');

    expect(restorePersistedCronSchedulesWithRunReconciliationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://localhost:8125',
        scheduleThread: ensureCronForThreadMock,
      }),
    );
  });
});
