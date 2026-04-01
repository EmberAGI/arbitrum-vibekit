import { describe, expect, it, vi } from 'vitest';

type LangGraphAgentConstructor = new (config: {
  deploymentUrl: string;
  graphId: string;
  agentName?: string;
  client: {
    assistants: {
      search: () => Promise<Array<{ graph_id: string; assistant_id: string }>>;
      getGraph: () => Promise<{ nodes: Array<{ id: string }>; edges: Array<{ source: string; target: string }> }>;
      getSchemas: () => Promise<{
        input_schema: { properties: Record<string, unknown> };
        output_schema: { properties: Record<string, unknown> };
        context_schema: { properties: Record<string, unknown> };
        config_schema: { properties: Record<string, unknown> };
      }>;
    };
    threads: {
      getState: () => Promise<{ values: { messages: Array<unknown> }; tasks: []; next: []; metadata: {} }>;
    };
    runs: {
      list: (
        threadId: string,
        params: { limit: number; offset: number },
      ) => Promise<
        Array<{
          run_id: string;
          status: 'pending' | 'running' | 'completed';
          created_at: string;
          updated_at?: string;
          metadata?: Record<string, unknown>;
        }>
      >;
    };
  };
}) => {
  threadId?: string;
  connectAgent: (
    input?: {
      forwardedProps?: {
        connectPollIntervalMs?: number;
        connectRunListLimit?: number;
        connectRunWindowSize?: number;
      };
    },
    subscriber?: Record<string, never>,
  ) => Promise<unknown>;
};

async function loadLangGraphAgent(): Promise<LangGraphAgentConstructor> {
  const loaded = (await import('@ag-ui/langgraph')) as unknown;

  if (
    typeof loaded !== 'object' ||
    loaded === null ||
    !('LangGraphAgent' in loaded) ||
    typeof loaded.LangGraphAgent !== 'function'
  ) {
    throw new Error('Unable to load LangGraphAgent constructor');
  }

  return loaded.LangGraphAgent as LangGraphAgentConstructor;
}

describe('LangGraphAgent connect pagination', () => {
  it('pages forward until it reaches the newest run window before selecting a connect candidate', async () => {
    const LangGraphAgent = await loadLangGraphAgent();
    const stopPolling = new Error('stop-test-after-tail-discovery');
    const listOffsets: number[] = [];

    const client = {
      assistants: {
        search: vi.fn(async () => [{ graph_id: 'graph-clmm', assistant_id: 'assistant-clmm' }]),
        getGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
        getSchemas: vi.fn(async () => ({
          input_schema: { properties: {} },
          output_schema: { properties: {} },
          context_schema: { properties: {} },
          config_schema: { properties: {} },
        })),
      },
      threads: {
        getState: vi.fn(async () => ({
          values: { messages: [] },
          tasks: [],
          next: [],
          metadata: {},
        })),
      },
      runs: {
        list: vi.fn(async (_threadId: string, params: { limit: number; offset: number }) => {
          listOffsets.push(params.offset);

          if (listOffsets.length > 3) {
            throw stopPolling;
          }

          if (params.limit !== 2) {
            throw new Error(`unexpected limit ${params.limit}`);
          }

          if (params.offset === 0) {
            return [
              { run_id: 'run-0001', status: 'completed' as const, created_at: '2026-03-07T01:08:25.392Z' },
              { run_id: 'run-0002', status: 'completed' as const, created_at: '2026-03-07T01:09:25.392Z' },
            ];
          }

          if (params.offset === 2) {
            return [
              { run_id: 'run-0003', status: 'completed' as const, created_at: '2026-03-07T01:10:25.392Z' },
              { run_id: 'run-0004', status: 'completed' as const, created_at: '2026-03-07T01:11:25.392Z' },
            ];
          }

          if (params.offset === 4) {
            return [
              { run_id: 'run-10678', status: 'completed' as const, created_at: '2026-03-11T01:22:33.621Z' },
            ];
          }

          throw new Error(`unexpected offset ${params.offset}`);
        }),
      },
    };

    const agent = new LangGraphAgent({
      deploymentUrl: 'http://localhost:8124',
      graphId: 'graph-clmm',
      agentName: 'agent-clmm',
      client,
    });
    agent.threadId = 'thread-clmm';

    await expect(
      agent.connectAgent(
        {
          forwardedProps: {
            connectPollIntervalMs: 0,
            connectRunListLimit: 2,
            connectRunWindowSize: 2,
          },
        },
        {},
      ),
    ).rejects.toThrow(stopPolling.message);

    expect(listOffsets.slice(0, 3)).toEqual([0, 2, 4]);
  });

  it('does not keep a stale cached window when later polls return different middle runs with the same boundary IDs', async () => {
    const LangGraphAgent = await loadLangGraphAgent();
    const stopPolling = new Error('stop-test-after-window-refresh');
    let listCallCount = 0;

    const client = {
      assistants: {
        search: vi.fn(async () => [{ graph_id: 'graph-clmm', assistant_id: 'assistant-clmm' }]),
        getGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
        getSchemas: vi.fn(async () => ({
          input_schema: { properties: {} },
          output_schema: { properties: {} },
          context_schema: { properties: {} },
          config_schema: { properties: {} },
        })),
      },
      threads: {
        getState: vi.fn(async () => ({
          values: { messages: [] },
          tasks: [],
          next: [],
          metadata: {},
        })),
      },
      runs: {
        list: vi.fn(async (_threadId: string, params: { limit: number; offset: number }) => {
          listCallCount += 1;

          if (params.limit !== 4) {
            throw new Error(`unexpected limit ${params.limit}`);
          }

          if (params.offset !== 0) {
            throw new Error(`unexpected offset ${params.offset}`);
          }

          if (listCallCount === 1) {
            return [
              { run_id: 'run-older', status: 'completed' as const, created_at: '2026-03-11T01:21:00.000Z' },
              { run_id: 'run-stale-middle', status: 'completed' as const, created_at: '2026-03-11T01:22:00.000Z' },
              { run_id: 'run-boundary', status: 'completed' as const, created_at: '2026-03-11T01:23:00.000Z' },
            ];
          }

          if (listCallCount === 2) {
            return [
              { run_id: 'run-older', status: 'completed' as const, created_at: '2026-03-11T01:21:00.000Z' },
              {
                run_id: 'run-fresh-middle',
                status: 'completed' as const,
                created_at: '2026-03-11T01:22:30.000Z',
                updated_at: '2026-03-11T01:24:00.000Z',
              },
              { run_id: 'run-boundary', status: 'completed' as const, created_at: '2026-03-11T01:23:00.000Z' },
            ];
          }

          throw stopPolling;
        }),
      },
    };

    const agent = new LangGraphAgent({
      deploymentUrl: 'http://localhost:8124',
      graphId: 'graph-clmm',
      agentName: 'agent-clmm',
      client,
    }) as LangGraphAgentConstructor & {
      dispatchEvent: (event: { type?: string; runId?: string }) => boolean;
    };
    agent.threadId = 'thread-clmm';

    const dispatchedRunIds: string[] = [];
    const originalDispatchEvent = agent.dispatchEvent.bind(agent);
    agent.dispatchEvent = (event) => {
      if (event.type === 'RUN_STARTED' && event.runId) {
        dispatchedRunIds.push(event.runId);
      }

      return originalDispatchEvent(event);
    };

    await expect(
      agent.connectAgent(
        {
          forwardedProps: {
            connectPollIntervalMs: 0,
            connectRunListLimit: 4,
            connectRunWindowSize: 3,
          },
        },
        {},
      ),
    ).rejects.toThrow(stopPolling.message);

    expect(dispatchedRunIds).toContain('run-boundary');
    expect(dispatchedRunIds).toContain('run-fresh-middle');
  });

  it('emits a fresh snapshot when the run list stays stale but thread state changes on a later poll', async () => {
    const LangGraphAgent = await loadLangGraphAgent();
    const stopPolling = new Error('stop-test-after-state-fallback');
    let listCallCount = 0;
    let stateCallCount = 0;

    const client = {
      assistants: {
        search: vi.fn(async () => [{ graph_id: 'graph-clmm', assistant_id: 'assistant-clmm' }]),
        getGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
        getSchemas: vi.fn(async () => ({
          input_schema: { properties: {} },
          output_schema: { properties: {} },
          context_schema: { properties: {} },
          config_schema: { properties: {} },
        })),
      },
      threads: {
        getState: vi.fn(async () => {
          stateCallCount += 1;
          const cycle = stateCallCount >= 3 ? 'cycle-2' : 'cycle-1';
          return {
            values: {
              messages: [],
              thread: {
                task: {
                  id: cycle,
                  taskStatus: {
                    state: cycle,
                  },
                },
              },
            },
            tasks: [],
            next: [],
            metadata: {},
          };
        }),
      },
      runs: {
        list: vi.fn(async (_threadId: string, params: { limit: number; offset: number }) => {
          listCallCount += 1;

          if (params.limit !== 4) {
            throw new Error(`unexpected limit ${params.limit}`);
          }

          if (params.offset !== 0) {
            throw new Error(`unexpected offset ${params.offset}`);
          }

          if (listCallCount >= 3) {
            throw stopPolling;
          }

          return [
            {
              run_id: 'run-stale-cron',
              status: 'completed' as const,
              created_at: '2026-03-07T09:20:30.223Z',
              metadata: { source: 'cron' },
            },
          ];
        }),
      },
    };

    const agent = new LangGraphAgent({
      deploymentUrl: 'http://localhost:8124',
      graphId: 'graph-clmm',
      agentName: 'agent-clmm',
      client,
    }) as LangGraphAgentConstructor & {
      dispatchEvent: (event: { type?: string; snapshot?: unknown }) => boolean;
    };
    agent.threadId = 'thread-clmm';

    const taskStates: string[] = [];
    const originalDispatchEvent = agent.dispatchEvent.bind(agent);
    agent.dispatchEvent = (event) => {
      if (event.type === 'STATE_SNAPSHOT' && event.snapshot && typeof event.snapshot === 'object') {
        const thread = (event.snapshot as { thread?: { task?: { taskStatus?: { state?: unknown } } } }).thread;
        const taskState = thread?.task?.taskStatus?.state;
        if (typeof taskState === 'string') {
          taskStates.push(taskState);
        }
      }

      return originalDispatchEvent(event);
    };

    await expect(
      agent.connectAgent(
        {
          forwardedProps: {
            connectPollIntervalMs: 0,
            connectRunListLimit: 4,
            connectRunWindowSize: 3,
          },
        },
        {},
      ),
    ).rejects.toThrow(stopPolling.message);

    expect(taskStates).toContain('cycle-2');
  });

  it('accepts persisted role-only user messages when emitting connect snapshots', async () => {
    const LangGraphAgent = await loadLangGraphAgent();
    const stopPolling = new Error('stop-test-after-initial-message-snapshot');

    const client = {
      assistants: {
        search: vi.fn(async () => [{ graph_id: 'graph-clmm', assistant_id: 'assistant-clmm' }]),
        getGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
        getSchemas: vi.fn(async () => ({
          input_schema: { properties: {} },
          output_schema: { properties: {} },
          context_schema: { properties: {} },
          config_schema: { properties: {} },
        })),
      },
      threads: {
        getState: vi.fn(async () => ({
          values: {
            messages: [
              {
                id: 'message-cycle-1',
                role: 'user',
                content: '{"command":"cycle"}',
              },
            ],
          },
          tasks: [],
          next: [],
          metadata: {},
        })),
      },
      runs: {
        list: vi.fn(async () => {
          throw stopPolling;
        }),
      },
    };

    const agent = new LangGraphAgent({
      deploymentUrl: 'http://localhost:8124',
      graphId: 'graph-clmm',
      agentName: 'agent-clmm',
      client,
    }) as LangGraphAgentConstructor & {
      dispatchEvent: (event: { type?: string; messages?: Array<{ id: string; role: string; content: string }> }) => boolean;
    };
    agent.threadId = 'thread-clmm';

    const messageSnapshots: Array<Array<{ id: string; role: string; content: string }>> = [];
    const originalDispatchEvent = agent.dispatchEvent.bind(agent);
    agent.dispatchEvent = (event) => {
      if (event.type === 'MESSAGES_SNAPSHOT' && Array.isArray(event.messages)) {
        messageSnapshots.push(event.messages);
      }

      return originalDispatchEvent(event);
    };

    await expect(
      agent.connectAgent(
        {
          forwardedProps: {
            connectPollIntervalMs: 0,
          },
        },
        {},
      ),
    ).rejects.toThrow(stopPolling.message);

    expect(messageSnapshots).toEqual([
      [
        {
          id: 'message-cycle-1',
          role: 'user',
          content: '{"command":"cycle"}',
        },
      ],
    ]);
  });

  it('rechecks a previously empty tail page so later same-thread runs beyond the original window are discovered', async () => {
    const LangGraphAgent = await loadLangGraphAgent();
    const stopPolling = new Error('stop-test-after-tail-growth');
    let listCallCount = 0;
    const listOffsets: number[] = [];

    const client = {
      assistants: {
        search: vi.fn(async () => [{ graph_id: 'graph-clmm', assistant_id: 'assistant-clmm' }]),
        getGraph: vi.fn(async () => ({ nodes: [], edges: [] })),
        getSchemas: vi.fn(async () => ({
          input_schema: { properties: {} },
          output_schema: { properties: {} },
          context_schema: { properties: {} },
          config_schema: { properties: {} },
        })),
      },
      threads: {
        getState: vi.fn(async () => ({
          values: {
            messages: [],
            thread: {
              task: {
                id: 'cycle-2',
                taskStatus: {
                  state: 'cycle-2',
                },
              },
            },
          },
          tasks: [],
          next: [],
          metadata: {},
        })),
      },
      runs: {
        list: vi.fn(async (_threadId: string, params: { limit: number; offset: number }) => {
          listCallCount += 1;
          listOffsets.push(params.offset);

          if (params.limit !== 3) {
            throw new Error(`unexpected limit ${params.limit}`);
          }

          if (listCallCount === 1 && params.offset === 0) {
            return [
              { run_id: 'run-0001', status: 'completed' as const, created_at: '2026-03-11T01:21:00.000Z' },
              { run_id: 'run-0002', status: 'completed' as const, created_at: '2026-03-11T01:22:00.000Z' },
              { run_id: 'run-0003', status: 'completed' as const, created_at: '2026-03-11T01:23:00.000Z' },
            ];
          }

          if (listCallCount === 2 && params.offset === 3) {
            return [];
          }

          if (listCallCount === 3 && params.offset === 3) {
            return [
              {
                run_id: 'run-0004',
                status: 'completed' as const,
                created_at: '2026-03-11T01:24:00.000Z',
                updated_at: '2026-03-11T01:24:10.000Z',
              },
            ];
          }

          throw stopPolling;
        }),
      },
    };

    const agent = new LangGraphAgent({
      deploymentUrl: 'http://localhost:8124',
      graphId: 'graph-clmm',
      agentName: 'agent-clmm',
      client,
    }) as LangGraphAgentConstructor & {
      dispatchEvent: (event: { type?: string; runId?: string }) => boolean;
    };
    agent.threadId = 'thread-clmm';

    const dispatchedRunIds: string[] = [];
    const originalDispatchEvent = agent.dispatchEvent.bind(agent);
    agent.dispatchEvent = (event) => {
      if (event.type === 'RUN_STARTED' && event.runId) {
        dispatchedRunIds.push(event.runId);
      }

      return originalDispatchEvent(event);
    };

    await expect(
      agent.connectAgent(
        {
          forwardedProps: {
            connectPollIntervalMs: 0,
            connectRunListLimit: 3,
            connectRunWindowSize: 3,
          },
        },
        {},
      ),
    ).rejects.toThrow(stopPolling.message);

    expect(listOffsets.slice(0, 2)).toEqual([0, 3]);
    expect(listOffsets.filter((offset) => offset === 3).length).toBeGreaterThanOrEqual(2);
    expect(dispatchedRunIds).toContain('run-0004');
  });
});
