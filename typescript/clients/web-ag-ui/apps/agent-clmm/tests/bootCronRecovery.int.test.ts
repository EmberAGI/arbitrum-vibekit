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
    restorePersistedCronSchedulesWithRunReconciliation:
      restorePersistedCronSchedulesWithRunReconciliationMock,
  };
});

vi.mock('../src/workflow/langgraphApiCheckpointer.js', () => ({
  configureLangGraphApiCheckpointer: configureLangGraphApiCheckpointerMock,
}));

vi.mock('../src/workflow/cronScheduler.js', async () => {
  const actual = await vi.importActual('../src/workflow/cronScheduler.js');
  return {
    ...actual,
    ensureCronForThread: ensureCronForThreadMock,
    configureCronExecutor: vi.fn(),
  };
});

describe('CLMM boot-time cron recovery', () => {
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
    delete process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('re-schedules recovered threads when the agent boots', async () => {
    await import('../src/agent.js');

    expect(configureLangGraphApiCheckpointerMock).toHaveBeenCalledTimes(1);
    expect(restorePersistedCronSchedulesWithRunReconciliationMock).toHaveBeenCalledTimes(1);
    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-recovered', 15_000);
  });

  it('delegates recovered run reconciliation to the shared helper with the agent scheduler', async () => {
    await import('../src/agent.js');

    expect(restorePersistedCronSchedulesWithRunReconciliationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://localhost:8124',
        scheduleThread: ensureCronForThreadMock,
      }),
    );
  });
});
