import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RestoreParams = {
  baseUrl: string;
  scheduleThread: (threadId: string, intervalMs?: number) => unknown;
};

const {
  configureLangGraphApiCheckpointerMock,
  restorePersistedCronSchedulesWithRunReconciliationMock,
  ensureCronForThreadMock,
  setupAgentLocalE2EMocksIfNeededMock,
} = vi.hoisted(() => ({
  configureLangGraphApiCheckpointerMock: vi.fn(async () => undefined),
  restorePersistedCronSchedulesWithRunReconciliationMock: vi.fn(
    async (_params: RestoreParams) => [],
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
    restorePersistedCronSchedulesWithRunReconciliation:
      restorePersistedCronSchedulesWithRunReconciliationMock,
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

describe('GMX Allora boot-time cron recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    configureLangGraphApiCheckpointerMock.mockReset();
    restorePersistedCronSchedulesWithRunReconciliationMock.mockReset();
    ensureCronForThreadMock.mockReset();
    setupAgentLocalE2EMocksIfNeededMock.mockReset();
    configureLangGraphApiCheckpointerMock.mockResolvedValue(undefined);
    setupAgentLocalE2EMocksIfNeededMock.mockResolvedValue(undefined);
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
    await import('../src/agent.js');

    expect(setupAgentLocalE2EMocksIfNeededMock).toHaveBeenCalledTimes(1);
    expect(configureLangGraphApiCheckpointerMock).toHaveBeenCalledTimes(1);
    expect(restorePersistedCronSchedulesWithRunReconciliationMock).toHaveBeenCalledTimes(1);
    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-recovered', 15_000);
  });

  it('delegates recovered run reconciliation to the shared helper with the agent scheduler', async () => {
    await import('../src/agent.js');

    expect(restorePersistedCronSchedulesWithRunReconciliationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'http://localhost:8126',
        scheduleThread: ensureCronForThreadMock,
      }),
    );
  });
});
