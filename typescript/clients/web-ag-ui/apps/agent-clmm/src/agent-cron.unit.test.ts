import { beforeEach, describe, expect, it, vi } from 'vitest';

type LangGraphClient = {
  assistants: {
    search: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  threads: {
    create: ReturnType<typeof vi.fn>;
    updateState: ReturnType<typeof vi.fn>;
    getState: ReturnType<typeof vi.fn>;
  };
  runs: {
    create: ReturnType<typeof vi.fn>;
    join: ReturnType<typeof vi.fn>;
  };
};

const mocks = vi.hoisted(() => {
  process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'] ??= `0x${'1'.repeat(64)}`;

  const client: LangGraphClient = {
    assistants: {
      search: vi.fn(),
      create: vi.fn(),
    },
    threads: {
      create: vi.fn(),
      updateState: vi.fn(),
      getState: vi.fn(),
    },
    runs: {
      create: vi.fn(),
      join: vi.fn(),
    },
  };

  return {
    client,
    configureLangGraphApiCheckpointer: vi.fn().mockResolvedValue(undefined),
    configureCronExecutor: vi.fn(),
    saveBootstrapContext: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@langchain/langgraph-sdk', () => {
  class Client {
    constructor() {
      return mocks.client;
    }
  }
  return { Client };
});

vi.mock('./workflow/langgraphApiCheckpointer.js', () => ({
  configureLangGraphApiCheckpointer: mocks.configureLangGraphApiCheckpointer,
}));

vi.mock('./workflow/cronScheduler.js', () => ({
  configureCronExecutor: mocks.configureCronExecutor,
}));

vi.mock('./workflow/store.js', () => ({
  saveBootstrapContext: mocks.saveBootstrapContext,
}));

describe('runGraphOnce', () => {
  beforeEach(() => {
    mocks.client.assistants.search.mockReset();
    mocks.client.assistants.create.mockReset();
    mocks.client.threads.create.mockReset();
    mocks.client.threads.updateState.mockReset();
    mocks.client.threads.getState.mockReset();
    mocks.client.runs.create.mockReset();
    mocks.client.runs.join.mockReset();
  });

  it('rewinds the thread and creates a resumable run via LangGraph APIs', async () => {
    // Given LangGraph APIs that return a known assistant and run id
    mocks.client.assistants.search.mockResolvedValue([{ assistant_id: 'assistant-1' }]);
    mocks.client.threads.create.mockResolvedValue(undefined);
    mocks.client.threads.updateState.mockResolvedValue(undefined);
    mocks.client.runs.create.mockResolvedValue({ run_id: 'run-1' });
    mocks.client.runs.join.mockResolvedValue(undefined);
    mocks.client.threads.getState.mockResolvedValue({ tasks: [] });

    // When executing a cron cycle
    vi.resetModules();
    const { runGraphOnce } = await import('./agent.js');
    await runGraphOnce('thread-123');

    // Then it ensures the thread exists
    expect(mocks.client.threads.create).toHaveBeenCalledWith({
      threadId: 'thread-123',
      graphId: 'agent-clmm',
      ifExists: 'do_nothing',
    });

    // And it rewinds execution to runCommand with a cycle command message
    const updateArgs = mocks.client.threads.updateState.mock.calls[0]?.[1] as {
      values?: { messages?: Array<{ role?: string; content?: string }>; view?: { command?: string } };
      asNode?: string;
    };
    expect(updateArgs?.asNode).toBe('runCommand');
    expect(updateArgs?.values?.view?.command).toBe('cycle');
    expect(updateArgs?.values?.messages?.[0]?.role).toBe('user');
    expect(updateArgs?.values?.messages?.[0]?.content).toContain('"cycle"');

    // And it creates a resumable run and joins it
    expect(mocks.client.runs.create).toHaveBeenCalledWith(
      'thread-123',
      'assistant-1',
      expect.objectContaining({
        streamMode: ['events', 'values', 'updates'],
        streamResumable: true,
      }),
    );
    expect(mocks.client.runs.join).toHaveBeenCalledWith('thread-123', 'run-1');
    expect(mocks.client.threads.getState).toHaveBeenCalledWith('thread-123');
  });

  it('skips overlapping runs for the same thread', async () => {
    // Given a run already in progress
    mocks.client.assistants.search.mockResolvedValue([{ assistant_id: 'assistant-1' }]);
    mocks.client.threads.create.mockResolvedValue(undefined);
    mocks.client.threads.updateState.mockResolvedValue(undefined);
    mocks.client.runs.create.mockResolvedValue({ run_id: 'run-1' });
    mocks.client.runs.join.mockResolvedValue(undefined);
    mocks.client.threads.getState.mockResolvedValue({ tasks: [] });

    vi.resetModules();
    const { runGraphOnce } = await import('./agent.js');

    // When we start a run and immediately trigger another cycle for the same thread
    const firstRun = runGraphOnce('thread-123');
    const secondRun = await runGraphOnce('thread-123');

    // Then the second invocation should be skipped
    expect(secondRun).toBeUndefined();
    await firstRun;

    // And only one run should have been created/joined
    expect(mocks.client.runs.create).toHaveBeenCalledTimes(1);
    expect(mocks.client.runs.join).toHaveBeenCalledTimes(1);
  });
});
