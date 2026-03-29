import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  configureLangGraphApiCheckpointerMock,
  restorePersistedCronSchedulesFromCheckpointerMock,
  ensureCronForThreadMock,
  setupAgentLocalE2EMocksIfNeededMock,
} = vi.hoisted(() => ({
  configureLangGraphApiCheckpointerMock: vi.fn(async () => undefined),
  restorePersistedCronSchedulesFromCheckpointerMock: vi.fn(async () => []),
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

describe('GMX Allora boot-time cron recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    configureLangGraphApiCheckpointerMock.mockReset();
    restorePersistedCronSchedulesFromCheckpointerMock.mockReset();
    ensureCronForThreadMock.mockReset();
    setupAgentLocalE2EMocksIfNeededMock.mockReset();
    configureLangGraphApiCheckpointerMock.mockResolvedValue(undefined);
    setupAgentLocalE2EMocksIfNeededMock.mockResolvedValue(undefined);
    restorePersistedCronSchedulesFromCheckpointerMock.mockImplementation(async (scheduleThread) => {
      await scheduleThread('thread-recovered', 15_000);
      return [{ threadId: 'thread-recovered', pollIntervalMs: 15_000 }];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-schedules recovered threads when the agent boots', async () => {
    await import('../src/agent.js');

    expect(setupAgentLocalE2EMocksIfNeededMock).toHaveBeenCalledTimes(1);
    expect(configureLangGraphApiCheckpointerMock).toHaveBeenCalledTimes(1);
    expect(restorePersistedCronSchedulesFromCheckpointerMock).toHaveBeenCalledTimes(1);
    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-recovered', 15_000);
  });
});
