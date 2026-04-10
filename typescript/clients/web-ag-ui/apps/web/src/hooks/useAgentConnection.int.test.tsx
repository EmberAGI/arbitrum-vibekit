// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSubscriber } from '@ag-ui/client';

import { useAgentConnection } from './useAgentConnection';
import type { AgentInterrupt } from '../types/agent';
import { __resetAgentStreamCoordinatorForTests } from '../utils/agentStreamCoordinator';
import { getAgentThreadId } from '../utils/agentThread';

type TestAgent = {
  threadId: string | undefined;
  state: Record<string, unknown>;
  addMessage: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
  subscribe: (subscriber: AgentSubscriber) => { unsubscribe: () => void };
  detachActiveRun: ReturnType<typeof vi.fn>;
  connectAgent: ReturnType<typeof vi.fn>;
  isRunning?: boolean | (() => boolean);
  runAgent?: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => {
  const runtimeStatuses = {
    Connected: 'connected',
    Disconnected: 'disconnected',
  } as const;

  const createAgent = (): TestAgent => {
    const agent: TestAgent = {
      threadId: undefined,
      state: {},
      addMessage: vi.fn(),
      setState: vi.fn((next: Record<string, unknown>) => {
        agent.state = next;
      }),
      subscribe: vi.fn(() => ({
        unsubscribe: vi.fn(),
      })),
      detachActiveRun: vi.fn(async () => undefined),
      connectAgent: vi.fn(async () => undefined),
    };

    return agent;
  };

  return {
    runtimeStatuses,
    runtimeStatus: runtimeStatuses.Connected as (typeof runtimeStatuses)[keyof typeof runtimeStatuses],
    threadId: 'thread-1',
    privyWalletAddress: null as string | null,
    agent: createAgent(),
    connectAgent: vi.fn(async () => undefined),
    runAgent: vi.fn(async () => undefined),
    stopAgent: vi.fn(() => undefined),
    disconnectFetch: vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            abortedCount: 1,
          }),
          { status: 200 },
        ),
    ),
    interruptState: {
      activeInterrupt: null as AgentInterrupt | null,
      canResolve: false,
      resolve: vi.fn(),
    },
    reset() {
      this.runtimeStatus = this.runtimeStatuses.Connected;
      this.threadId = 'thread-1';
      this.privyWalletAddress = null;
      this.agent = createAgent();
      this.connectAgent.mockReset();
      this.connectAgent.mockImplementation(async () => undefined);
      this.runAgent.mockReset();
      this.runAgent.mockImplementation(async () => undefined);
      this.stopAgent.mockReset();
      this.stopAgent.mockImplementation(() => undefined);
      this.disconnectFetch.mockReset();
      this.disconnectFetch.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              ok: true,
              abortedCount: 1,
            }),
            { status: 200 },
          ),
      );
      this.interruptState.activeInterrupt = null;
      this.interruptState.canResolve = false;
      this.interruptState.resolve.mockReset();
    },
  };
});

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotKitCoreRuntimeConnectionStatus: mocks.runtimeStatuses,
  useAgent: () => ({
    agent: mocks.agent,
  }),
  useCopilotKit: () => ({
    copilotkit: {
      runtimeConnectionStatus: mocks.runtimeStatus,
      connectAgent: mocks.connectAgent,
      runAgent: mocks.runAgent,
      stopAgent: mocks.stopAgent,
    },
  }),
}));

vi.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ threadId: mocks.threadId }),
  useLangGraphInterruptRender: () => null,
}));

vi.mock('../app/hooks/useLangGraphInterruptCustomUI', () => ({
  useLangGraphInterruptCustomUI: () => ({
    activeInterrupt: mocks.interruptState.activeInterrupt,
    canResolve: () => mocks.interruptState.canResolve,
    resolve: mocks.interruptState.resolve,
  }),
}));

vi.mock('../hooks/usePrivyWalletClient', () => ({
  usePrivyWalletClient: () => ({
    privyWallet: mocks.privyWalletAddress ? { address: mocks.privyWalletAddress } : null,
  }),
}));

function TestHarness({ agentId }: { agentId: string }) {
  useAgentConnection(agentId);
  return <div data-testid="agent-connection-harness" />;
}

function CapturingHarness({
  agentId,
  onSnapshot,
}: {
  agentId: string;
  onSnapshot: (value: ReturnType<typeof useAgentConnection>) => void;
}) {
  const value = useAgentConnection(agentId);
  onSnapshot(value);
  return <div data-testid="agent-connection-harness" />;
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useAgentConnection integration', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalFetch = global.fetch;

  const readDisconnectPayload = (): { agentId?: string; threadId?: string } | null => {
    const latestCall = mocks.disconnectFetch.mock.calls.at(-1);
    if (!latestCall) return null;
    const init = latestCall[1];
    if (!init || typeof init !== 'object') return null;
    if (!('body' in init)) return null;
    const body = init.body;
    if (typeof body !== 'string') return null;
    try {
      const parsed = JSON.parse(body) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return null;
      const payload = parsed as { agentId?: unknown; threadId?: unknown };
      return {
        agentId: typeof payload.agentId === 'string' ? payload.agentId : undefined,
        threadId: typeof payload.threadId === 'string' ? payload.threadId : undefined,
      };
    } catch {
      return null;
    }
  };

  beforeEach(() => {
    __resetAgentStreamCoordinatorForTests();
    mocks.reset();
    vi.stubGlobal('fetch', mocks.disconnectFetch as unknown as typeof fetch);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    global.fetch = originalFetch;
    __resetAgentStreamCoordinatorForTests();
  });

  it('connects only while the detail page is mounted and focused', async () => {
    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(mocks.connectAgent).toHaveBeenCalledTimes(1);
    expect(mocks.connectAgent).toHaveBeenCalledWith({ agent: mocks.agent });
    expect(mocks.agent.threadId).toBe('thread-1');

    await act(async () => {
      root.unmount();
    });
    await flushEffects();

    expect(mocks.agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(mocks.stopAgent).toHaveBeenCalledTimes(0);
    expect(mocks.disconnectFetch).toHaveBeenCalledTimes(1);
    expect(readDisconnectPayload()).toEqual({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
    });
  });

  it('prefers the deterministic hired-agent thread over the generic copilot context thread', async () => {
    mocks.threadId = 'generic-copilot-thread';
    mocks.privyWalletAddress = '0x9999999999999999999999999999999999999999';

    const expectedThreadId = getAgentThreadId('agent-clmm', mocks.privyWalletAddress);

    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(expectedThreadId).toBeTruthy();
    expect(mocks.connectAgent).toHaveBeenCalledTimes(1);
    expect(mocks.agent.threadId).toBe(expectedThreadId);
  });

  it('disconnects the old deterministic thread and reconnects when the privy wallet changes', async () => {
    mocks.threadId = 'generic-copilot-thread';
    mocks.privyWalletAddress = '0xbD70792F773a39f88b43d35bb5Aa3d5e098EfeA4';

    const oldThreadId = getAgentThreadId('agent-clmm', mocks.privyWalletAddress);

    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(oldThreadId).toBeTruthy();
    expect(mocks.connectAgent).toHaveBeenCalledTimes(1);
    expect(mocks.agent.threadId).toBe(oldThreadId);

    mocks.privyWalletAddress = '0xaD53eC51a70e9a17df6752fdA80cd465457c258d';
    const newThreadId = getAgentThreadId('agent-clmm', mocks.privyWalletAddress);

    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(newThreadId).toBeTruthy();
    expect(mocks.connectAgent).toHaveBeenCalledTimes(2);
    expect(mocks.agent.threadId).toBe(newThreadId);
    expect(mocks.disconnectFetch).toHaveBeenCalledTimes(1);
    expect(readDisconnectPayload()).toEqual({
      agentId: 'agent-clmm',
      threadId: oldThreadId,
    });
  });

  it('falls back to the copilot context thread when no deterministic hired-agent thread is available', async () => {
    mocks.threadId = 'generic-copilot-thread';
    mocks.privyWalletAddress = null;

    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(mocks.connectAgent).toHaveBeenCalledTimes(1);
    expect(mocks.agent.threadId).toBe('generic-copilot-thread');
  });

  it('does not connect when runtime transport is not connected', async () => {
    mocks.runtimeStatus = mocks.runtimeStatuses.Disconnected;

    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(mocks.connectAgent).not.toHaveBeenCalled();
  });

  it('detaches active detail connection when runtime transport disconnects', async () => {
    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(mocks.connectAgent).toHaveBeenCalledTimes(1);
    expect(mocks.agent.detachActiveRun).toHaveBeenCalledTimes(0);

    mocks.runtimeStatus = mocks.runtimeStatuses.Disconnected;
    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(mocks.agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(mocks.stopAgent).toHaveBeenCalledTimes(0);
    expect(mocks.disconnectFetch).toHaveBeenCalledTimes(1);
  });

  it('does not call stopAgent during cleanup while a run is active', async () => {
    let subscriber: AgentSubscriber | undefined;
    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    subscriber?.onRunStartedEvent?.({ input: { threadId: 'thread-1' } });
    await flushEffects();

    await act(async () => {
      root.unmount();
    });
    await flushEffects();

    expect(mocks.agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(mocks.stopAgent).toHaveBeenCalledTimes(0);
    expect(mocks.disconnectFetch).toHaveBeenCalledTimes(1);
  });

  it('reconnects detail connection after runtime transport recovers', async () => {
    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(mocks.connectAgent).toHaveBeenCalledTimes(1);

    mocks.runtimeStatus = mocks.runtimeStatuses.Disconnected;
    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(mocks.agent.detachActiveRun).toHaveBeenCalledTimes(1);

    mocks.runtimeStatus = mocks.runtimeStatuses.Connected;
    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(mocks.connectAgent).toHaveBeenCalledTimes(2);
  });

  it('retries connect after a busy thread attach failure', async () => {
    vi.useFakeTimers();
    mocks.connectAgent
      .mockRejectedValueOnce(new Error('Thread already running'))
      .mockResolvedValue(undefined);

    try {
      await act(async () => {
        root.render(<TestHarness agentId="agent-clmm" />);
      });
      await flushEffects();

      expect(mocks.connectAgent).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2_000);
      await flushEffects();

      expect(mocks.connectAgent).toHaveBeenCalledTimes(2);
      expect(mocks.connectAgent).toHaveBeenLastCalledWith({ agent: mocks.agent });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not force Pi detail reconnect polling once connect is attached', async () => {
    vi.useFakeTimers();

    try {
      await act(async () => {
        root.render(<TestHarness agentId="agent-pi-example" />);
      });
      await flushEffects();

      expect(mocks.connectAgent).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_000);
      await flushEffects();

      expect(mocks.connectAgent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saveSettings mutates local state and dispatches sync through AG-UI run', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue).not.toBeNull();

    latestValue?.saveSettings({ amount: 250 });
    await flushEffects();

    expect(mocks.agent.setState).toHaveBeenCalled();
    const syncMessage = mocks.agent.addMessage.mock.calls.at(-1)?.[0] as
      | { content?: string; role?: string }
      | undefined;
    const parsedMessage =
      typeof syncMessage?.content === 'string'
        ? (JSON.parse(syncMessage.content) as { command?: string; clientMutationId?: string })
        : null;
    expect(syncMessage?.role).toBe('user');
    expect(parsedMessage?.command).toBe('sync');
    expect(typeof parsedMessage?.clientMutationId).toBe('string');
    expect(mocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.agent,
        threadId: 'thread-1',
      }),
    );
  });

  it('applies returned domain projection to the current thread snapshot', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'completed',
            message: 'Projection hydration completed.',
          },
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-portfolio-manager"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    act(() => {
      latestValue?.applyDomainProjection({
        managedMandateEditor: {
          mandateRef: 'mandate-ember-lending-001',
          targetAgentId: 'ember-lending',
        },
      });
    });
    await flushEffects();

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-portfolio-manager"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(mocks.agent.setState).toHaveBeenCalledWith(
      expect.objectContaining({
        thread: expect.objectContaining({
          domainProjection: {
            managedMandateEditor: {
              mandateRef: 'mandate-ember-lending-001',
              targetAgentId: 'ember-lending',
            },
          },
        }),
      }),
    );
    expect(latestValue?.domainProjection).toEqual({
      managedMandateEditor: {
        mandateRef: 'mandate-ember-lending-001',
        targetAgentId: 'ember-lending',
      },
    });
  });

  it('sendChatMessage dispatches a plain user message and runs the agent', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-pi-example"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    const chatApi = latestValue as unknown as {
      sendChatMessage: (content: string) => void;
    };

    chatApi.sendChatMessage('Hello from the chat tab');
    await flushEffects();

    const chatMessage = mocks.agent.addMessage.mock.calls.at(-1)?.[0] as
      | { content?: string; role?: string }
      | undefined;

    expect(chatMessage).toEqual(
      expect.objectContaining({
        role: 'user',
        content: 'Hello from the chat tab',
      }),
    );
    expect(latestValue?.messages).toEqual([]);

    subscriber?.onMessagesSnapshotEvent?.({
      input: { threadId: 'thread-1' },
      messages: [
        {
          id: chatMessage?.id as string,
          role: 'user',
          content: 'Hello from the chat tab',
        },
      ],
    });
    await flushEffects();

    expect(latestValue?.messages).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        role: 'user',
        content: 'Hello from the chat tab',
      }),
    ]);
    expect(mocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.agent,
        threadId: 'thread-1',
      }),
    );
  });

  it('keeps sync pending until AG-UI state confirms the applied mutation id', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    latestValue?.saveSettings({ amount: 250 });
    await flushEffects();
    expect(latestValue?.isSyncing).toBe(true);

    const syncMessage = mocks.agent.addMessage.mock.calls.at(-1)?.[0] as
      | { content?: string }
      | undefined;
    const parsedMessage =
      typeof syncMessage?.content === 'string'
        ? (JSON.parse(syncMessage.content) as { command?: string; clientMutationId?: string })
        : null;
    expect(parsedMessage?.command).toBe('sync');
    expect(typeof parsedMessage?.clientMutationId).toBe('string');
    const clientMutationId = parsedMessage?.clientMutationId as string;

    subscriber?.onRunFinishedEvent?.({ input: { threadId: 'thread-1' } });
    await flushEffects();
    expect(latestValue?.isSyncing).toBe(true);

    subscriber?.onRunInitialized?.({
      input: { threadId: 'thread-1' },
      state: {
        settings: { amount: 250 },
        thread: {
          command: 'cycle',
          lastAppliedClientMutationId: clientMutationId,
        },
      },
    });
    await flushEffects();
    await flushEffects();
    expect(latestValue?.isSyncing).toBe(false);
  });

  it('clears sync pending when mutation id acknowledgement arrives on thread payloads', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    latestValue?.saveSettings({ amount: 250 });
    await flushEffects();
    expect(latestValue?.isSyncing).toBe(true);

    const syncMessage = mocks.agent.addMessage.mock.calls.at(-1)?.[0] as
      | { content?: string }
      | undefined;
    const parsedMessage =
      typeof syncMessage?.content === 'string'
        ? (JSON.parse(syncMessage.content) as { command?: string; clientMutationId?: string })
        : null;
    expect(parsedMessage?.command).toBe('sync');
    expect(typeof parsedMessage?.clientMutationId).toBe('string');
    const clientMutationId = parsedMessage?.clientMutationId as string;

    subscriber?.onRunFinishedEvent?.({ input: { threadId: 'thread-1' } });
    await flushEffects();
    expect(latestValue?.isSyncing).toBe(true);

    subscriber?.onRunInitialized?.({
      input: { threadId: 'thread-1' },
      state: {
        settings: { amount: 250 },
        thread: {
          lastAppliedClientMutationId: clientMutationId,
        },
      },
    });
    await flushEffects();
    await flushEffects();

    expect(latestValue?.isSyncing).toBe(false);
  });

  it('ignores stale run lifecycle events that do not match the active thread', async () => {
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(<TestHarness agentId="agent-clmm" />);
    });
    await flushEffects();

    expect(subscriber).toBeDefined();
    mocks.agent.setState.mockClear();

    subscriber?.onRunInitialized?.({
      state: { thread: { command: 'cycle' } },
      input: { threadId: 'stale-thread' },
    });
    await flushEffects();
    expect(mocks.agent.setState).not.toHaveBeenCalled();

    subscriber?.onRunInitialized?.({
      state: { thread: { command: 'cycle' } },
      input: { threadId: 'thread-1' },
    });
    await flushEffects();
    expect(mocks.agent.setState).toHaveBeenCalledTimes(1);
  });

  it('applies state snapshot events after run init to avoid stale task status', async () => {
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(<TestHarness agentId="agent-gmx-allora" />);
    });
    await flushEffects();

    expect(subscriber).toBeDefined();
    mocks.agent.setState.mockClear();

    subscriber?.onRunInitialized?.({
      state: {
        thread: {
          task: {
            id: 'task-1',
            taskStatus: {
              state: 'input-required',
              message: { content: 'Waiting for delegation approval to continue onboarding.' },
            },
          },
        },
      },
      input: { threadId: 'thread-1' },
    });
    await flushEffects();
    expect(mocks.agent.setState).toHaveBeenCalledTimes(1);

    subscriber?.onStateSnapshotEvent?.({
      event: {
        snapshot: {
          thread: {
            task: {
              id: 'task-1',
              taskStatus: {
                state: 'working',
                message: { content: 'Onboarding complete. GMX Allora strategy is active.' },
              },
            },
          },
        },
      },
      input: { threadId: 'thread-1' },
    });
    await flushEffects();

    expect(mocks.agent.setState).toHaveBeenCalledTimes(2);
    const latestState = mocks.agent.setState.mock.calls.at(-1)?.[0] as
      | { thread?: { task?: { taskStatus?: { state?: string } } } }
      | undefined;
    expect(latestState?.thread?.task?.taskStatus?.state).toBe('working');
  });

  it('ignores stale run-id snapshots that arrive after a newer run state', async () => {
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(<TestHarness agentId="agent-gmx-allora" />);
    });
    await flushEffects();

    expect(subscriber).toBeDefined();
    mocks.agent.setState.mockClear();

    subscriber?.onRunInitialized?.({
      state: {
        thread: {
          task: {
            id: 'task-new',
            taskStatus: {
              state: 'working',
              message: { content: 'Onboarding complete. GMX Allora strategy is active.' },
            },
          },
        },
      },
      input: { threadId: 'thread-1', runId: 'run-new' },
    });
    await flushEffects();
    expect(mocks.agent.setState).toHaveBeenCalledTimes(1);

    subscriber?.onStateSnapshotEvent?.({
      event: {
        snapshot: {
          thread: {
            task: {
              id: 'task-old',
              taskStatus: {
                state: 'input-required',
                message: { content: 'Waiting for delegation approval to continue onboarding.' },
              },
            },
          },
        },
      },
      input: { threadId: 'thread-1', runId: 'run-old' },
    });
    await flushEffects();

    expect(mocks.agent.setState).toHaveBeenCalledTimes(1);
    const latestState = mocks.agent.setState.mock.calls.at(-1)?.[0] as
      | { thread?: { task?: { taskStatus?: { state?: string } } } }
      | undefined;
    expect(latestState?.thread?.task?.taskStatus?.state).toBe('working');
  });

  it('accepts a newly initialized run after an older run is already tracked', async () => {
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(<TestHarness agentId="agent-gmx-allora" />);
    });
    await flushEffects();

    expect(subscriber).toBeDefined();
    mocks.agent.setState.mockClear();

    subscriber?.onRunStartedEvent?.({
      input: { threadId: 'thread-1', runId: 'run-old' },
    });
    await flushEffects();

    subscriber?.onRunInitialized?.({
      state: {
        thread: {
          onboardingFlow: {
            status: 'in_progress',
            revision: 2,
            activeStepId: 'fund-wallet',
            steps: [{ id: 'fund-wallet', title: 'Fund Wallet', status: 'active' }],
          },
          task: {
            id: 'task-next',
            taskStatus: {
              state: 'input-required',
              message: { content: 'Fund wallet and continue.' },
            },
          },
        },
      },
      input: { threadId: 'thread-1', runId: 'run-new' },
    });
    await flushEffects();

    expect(mocks.agent.setState).toHaveBeenCalledTimes(1);
    const latestState = mocks.agent.setState.mock.calls.at(-1)?.[0] as
      | {
          thread?: {
            onboardingFlow?: { activeStepId?: string };
            task?: { id?: string; taskStatus?: { state?: string } };
          };
        }
      | undefined;
    expect(latestState?.thread?.task?.id).toBe('task-next');
    expect(latestState?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(latestState?.thread?.onboardingFlow?.activeStepId).toBe('fund-wallet');
  });

  it('keeps existing onboarding state when a run initializes with an empty state payload', async () => {
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    mocks.agent.state = {
      thread: {
        onboardingFlow: {
          status: 'in_progress',
          revision: 2,
          activeStepId: 'fund-wallet',
          steps: [{ id: 'fund-wallet', title: 'Fund Wallet', status: 'active' }],
        },
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: { content: 'Fund wallet and continue.' },
          },
        },
      },
    };

    await act(async () => {
      root.render(<TestHarness agentId="agent-gmx-allora" />);
    });
    await flushEffects();

    expect(subscriber).toBeDefined();
    mocks.agent.setState.mockClear();

    subscriber?.onRunInitialized?.({
      state: {},
      input: { threadId: 'thread-1', runId: 'run-empty' },
    });
    await flushEffects();

    expect(mocks.agent.setState).not.toHaveBeenCalled();
  });

  it('applies onboarding snapshots without run-id after completion state is applied', async () => {
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(<TestHarness agentId="agent-gmx-allora" />);
    });
    await flushEffects();

    expect(subscriber).toBeDefined();
    mocks.agent.setState.mockClear();

    subscriber?.onRunInitialized?.({
      state: {
        thread: {
          onboardingFlow: {
            status: 'completed',
            revision: 4,
            steps: [],
          },
          task: {
            id: 'task-new',
            taskStatus: {
              state: 'working',
              message: { content: 'Onboarding complete. GMX Allora strategy is active.' },
            },
          },
        },
      },
      input: { threadId: 'thread-1', runId: 'run-new' },
    });
    await flushEffects();
    expect(mocks.agent.setState).toHaveBeenCalledTimes(1);

    subscriber?.onStateSnapshotEvent?.({
      event: {
        snapshot: {
          thread: {
            task: {
              id: 'task-old',
              taskStatus: {
                state: 'input-required',
                message: { content: 'Cycle paused until onboarding input is complete.' },
              },
            },
          },
        },
      },
      input: { threadId: 'thread-1' },
    });
    await flushEffects();

    expect(mocks.agent.setState).toHaveBeenCalledTimes(2);
    const latestState = mocks.agent.setState.mock.calls.at(-1)?.[0] as
      | { thread?: { task?: { taskStatus?: { state?: string } } } }
      | undefined;
    expect(latestState?.thread?.task?.taskStatus?.state).toBe('input-required');
  });

  it('reflects an empty Pi reconnect transcript instead of preserving stale local messages', async () => {
    let subscriber: AgentSubscriber | undefined;
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-pi-example"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    subscriber?.onMessagesSnapshotEvent?.({
      input: { threadId: 'thread-1' },
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Scheduled sync every minute.',
        },
      ],
    });
    await flushEffects();
    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-pi-example"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.messages).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        content: 'Scheduled sync every minute.',
      }),
    ]);

    mocks.agent.state = {
      thread: {
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'completed',
            message: 'Automation sync executed successfully.',
          },
        },
      },
      messages: [],
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-pi-example"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();
    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-pi-example"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.messages).toEqual([]);
  });

  it('keeps local run ownership gated until active-thread terminal events are observed', async () => {
    let subscriber: AgentSubscriber | undefined;
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    subscriber?.onRunStartedEvent?.({ input: { threadId: 'thread-1' } });
    await flushEffects();

    latestValue?.runHire();
    await flushEffects();
    expect(latestValue?.uiError).toBe('Unable to start hire while another run is active.');

    subscriber?.onRunFinishedEvent?.({ input: { threadId: 'stale-thread' } });
    await flushEffects();

    latestValue?.runHire();
    await flushEffects();
    expect(latestValue?.uiError).toBe('Unable to start hire while another run is active.');

    subscriber?.onRunFinishedEvent?.({ input: { threadId: 'thread-1' } });
    await flushEffects();

    mocks.agent.addMessage.mockClear();
    latestValue?.runHire();
    await flushEffects();

    const resumedHireMessage = mocks.agent.addMessage.mock.calls.at(-1)?.[0] as
      | { role?: string; content?: string }
      | undefined;
    const parsedResumedHireMessage =
      typeof resumedHireMessage?.content === 'string'
        ? (JSON.parse(resumedHireMessage.content) as { command?: string; clientMutationId?: string })
        : null;
    expect(resumedHireMessage?.role).toBe('user');
    expect(parsedResumedHireMessage?.command).toBe('hire');
    expect(typeof parsedResumedHireMessage?.clientMutationId).toBe('string');
  });

  it('surfaces busy UI state when saveSettings sync dispatch is rejected as busy', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;
    vi.useFakeTimers();
    mocks.runAgent.mockRejectedValue(new Error('run already active'));

    try {
      await act(async () => {
        root.render(
          <CapturingHarness
            agentId="agent-clmm"
            onSnapshot={(value) => {
              latestValue = value;
            }}
          />,
        );
      });
      await flushEffects();

      latestValue?.saveSettings({ amount: 321 });
      await flushEffects();
      await vi.advanceTimersByTimeAsync(2_500);
      await flushEffects();

      expect(latestValue?.uiError).toContain("busy while processing 'sync'");
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces busy UI state when hire command is rejected as busy', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;
    mocks.runAgent.mockRejectedValueOnce(new Error('run already active'));

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    latestValue?.runHire();
    await flushEffects();
    await flushEffects();

    expect(latestValue?.uiError).toContain("busy while processing 'hire'");
  });

  it('does not optimistically mutate runtime state when dispatching hire', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    mocks.agent.setState.mockClear();
    latestValue?.runHire();
    await flushEffects();

    const hireMessage = mocks.agent.addMessage.mock.calls.at(-1)?.[0] as
      | { role?: string; content?: string }
      | undefined;
    const parsedHireMessage =
      typeof hireMessage?.content === 'string'
        ? (JSON.parse(hireMessage.content) as { command?: string; clientMutationId?: string })
        : null;
    expect(hireMessage?.role).toBe('user');
    expect(parsedHireMessage?.command).toBe('hire');
    expect(typeof parsedHireMessage?.clientMutationId).toBe('string');
    expect(mocks.agent.setState).not.toHaveBeenCalled();
  });

  it('dispatches PI-runtime hire through forwardedProps command instead of a JSON user message', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-portfolio-manager"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    mocks.agent.addMessage.mockClear();
    mocks.runAgent.mockClear();

    latestValue?.runHire();
    await flushEffects();

    expect(mocks.agent.addMessage).not.toHaveBeenCalled();
    expect(mocks.runAgent).toHaveBeenCalledWith({
      agent: mocks.agent,
      threadId: 'thread-1',
      forwardedProps: {
        command: {
          name: 'hire',
        },
      },
    });
    expect(mocks.agent.setState).not.toHaveBeenCalled();
  });

  it('does not optimistically mutate runtime state when dispatching fire', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    mocks.agent.setState.mockClear();
    latestValue?.runFire();
    await flushEffects();
    await flushEffects();
    expect(mocks.agent.setState).not.toHaveBeenCalled();
  });

  it('detaches stale local run ownership without stopAgent before dispatching fire', async () => {
    let subscriber: AgentSubscriber | undefined;
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    subscriber?.onRunStartedEvent?.({ input: { threadId: 'thread-1' } });
    await flushEffects();

    latestValue?.runFire();
    await flushEffects();

    expect(mocks.stopAgent).not.toHaveBeenCalled();
    expect(mocks.agent.detachActiveRun.mock.calls.length).toBeGreaterThanOrEqual(1);
    subscriber?.onRunFinishedEvent?.({ input: { threadId: 'thread-1' } });
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    await flushEffects();
    await flushEffects();

    const fireMessage = mocks.agent.addMessage.mock.calls.at(-1)?.[0] as
      | { role?: string; content?: string }
      | undefined;
    const parsedFireMessage =
      typeof fireMessage?.content === 'string'
        ? (JSON.parse(fireMessage.content) as { command?: string; clientMutationId?: string })
        : null;
    expect(fireMessage?.role).toBe('user');
    expect(parsedFireMessage?.command).toBe('fire');
    expect(typeof parsedFireMessage?.clientMutationId).toBe('string');
  });

  it('uses stopAgent preemption when backend reports an active run during fire', async () => {
    let subscriber: AgentSubscriber | undefined;
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });
    mocks.agent.isRunning = () => true;

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    latestValue?.runFire();
    await flushEffects();

    expect(mocks.stopAgent).toHaveBeenCalledWith({ agent: mocks.agent });
    expect(mocks.agent.detachActiveRun.mock.calls.length).toBeGreaterThanOrEqual(1);
    subscriber?.onRunFinishedEvent?.({ input: { threadId: 'thread-1' } });
    await flushEffects();
  });

  it('dispatches PI-runtime fire through forwardedProps command instead of a JSON user message', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        lifecycle: {
          phase: 'active',
        },
        task: {
          id: 'task-active',
          taskStatus: {
            state: 'working',
            message: { content: 'Portfolio manager is active.' },
          },
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-portfolio-manager"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    mocks.agent.addMessage.mockClear();
    mocks.runAgent.mockClear();

    latestValue?.runFire();
    await flushEffects();

    expect(mocks.agent.addMessage).not.toHaveBeenCalled();
    expect(mocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.agent,
        threadId: 'thread-1',
        forwardedProps: {
          command: {
            name: 'fire',
          },
        },
      }),
    );
  });

  it('marks agent as not hired once fire reaches a terminal task state', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        lifecycle: {
          phase: 'firing',
        },
        task: {
          id: 'task-fire',
          taskStatus: {
            state: 'working',
            message: { content: 'Firing agent...' },
          },
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-gmx-allora"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();
    expect(latestValue?.isHired).toBe(true);

    mocks.agent.state = {
      thread: {
        lifecycle: {
          phase: 'inactive',
        },
        task: {
          id: 'task-fire',
          taskStatus: {
            state: 'completed',
            message: { content: 'Fire completed.' },
          },
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-gmx-allora"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();
    expect(latestValue?.isHired).toBe(false);
  });

  it('does not treat stale hire command as hired when lifecycle phase is inactive', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        command: 'hire',
        lifecycle: {
          phase: 'inactive',
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.isHired).toBe(false);
  });

  it('does not treat command alone as hired when lifecycle is missing', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        command: 'hire',
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.isHired).toBe(false);
  });

  it('does not infer hired state from onboarding completion fields without lifecycle', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        command: 'cycle',
        setupComplete: true,
        onboardingFlow: {
          status: 'completed',
          steps: [],
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();
    expect(latestValue?.isHired).toBe(false);

    mocks.agent.state = {
      thread: {
        command: undefined,
        setupComplete: true,
        onboardingFlow: {
          status: 'completed',
          steps: [],
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();
    expect(latestValue?.isHired).toBe(false);
  });

  it('requires lifecycle phase to derive hired state', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        setupComplete: true,
        onboardingFlow: {
          status: 'completed',
          steps: [],
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.isHired).toBe(false);
  });

  it('treats thread payloads as loaded state for sync gating', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        profile: {
          chains: ['Arbitrum'],
          protocols: ['Camelot'],
          tokens: ['WETH', 'USDC'],
          pools: [],
          allowedPools: [],
          totalUsers: 42,
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.hasLoadedView).toBe(true);
  });

  it('marks agent active from non-terminal task state even when command is omitted', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        command: undefined,
        task: {
          id: 'task-cycle',
          taskStatus: {
            state: 'working',
            message: { content: 'Cycle in progress.' },
          },
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.isActive).toBe(true);
  });

  it('does not treat prehire chat task progress as hired or active', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        lifecycle: {
          phase: 'prehire',
        },
        task: {
          id: 'task-chat',
          taskStatus: {
            state: 'working',
            message: 'Ready for a live runtime conversation.',
          },
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-portfolio-manager"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.hasLoadedView).toBe(true);
    expect(latestValue?.isHired).toBe(false);
    expect(latestValue?.isActive).toBe(false);
  });

  it('does not treat a null-lifecycle idle-ready runtime thread as hired or active', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.agent.state = {
      thread: {
        lifecycle: null,
        task: {
          id: 'task-ready',
          taskStatus: {
            state: 'working',
            message: 'Ready for a live runtime conversation.',
          },
        },
      },
    };

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-portfolio-manager"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.hasLoadedView).toBe(true);
    expect(latestValue?.isHired).toBe(false);
    expect(latestValue?.isActive).toBe(false);
  });

  it('serializes rapid A->B->A detail handoff so next connect waits for prior disconnect', async () => {
    let resolveDetachAtoB: (() => void) | null = null;
    let resolveDetachBtoA: (() => void) | null = null;
    const pendingAtoB = new Promise<void>((resolve) => {
      resolveDetachAtoB = resolve;
    });
    const pendingBtoA = new Promise<void>((resolve) => {
      resolveDetachBtoA = resolve;
    });

    const originalDetach = mocks.agent.detachActiveRun;
    let detachInvocation = 0;
    mocks.agent.detachActiveRun.mockImplementation(() => {
      detachInvocation += 1;
      if (detachInvocation === 1) {
        return pendingAtoB;
      }
      if (detachInvocation === 2) {
        return pendingBtoA;
      }
      return Promise.resolve();
    });

    const containerB = document.createElement('div');
    document.body.appendChild(containerB);
    const rootB = createRoot(containerB);
    const containerA2 = document.createElement('div');
    document.body.appendChild(containerA2);
    const rootA2 = createRoot(containerA2);

    try {
      await act(async () => {
        root.render(<TestHarness agentId="agent-clmm" />);
      });
      await flushEffects();
      expect(mocks.connectAgent).toHaveBeenCalledTimes(1);

      await act(async () => {
        rootB.render(<TestHarness agentId="agent-gmx-allora" />);
      });
      await flushEffects();
      expect(mocks.connectAgent).toHaveBeenCalledTimes(1);

      resolveDetachAtoB?.();
      await flushEffects();
      await flushEffects();
      expect(mocks.connectAgent).toHaveBeenCalledTimes(2);

      await act(async () => {
        root.unmount();
      });
      await flushEffects();

      await act(async () => {
        rootA2.render(<TestHarness agentId="agent-clmm" />);
      });
      await flushEffects();
      expect(mocks.connectAgent).toHaveBeenCalledTimes(2);

      resolveDetachBtoA?.();
      await flushEffects();
      await flushEffects();
      expect(mocks.connectAgent).toHaveBeenCalledTimes(3);
    } finally {
      mocks.agent.detachActiveRun = originalDetach;
      await act(async () => {
        rootA2.unmount();
      });
      await act(async () => {
        rootB.unmount();
      });
      containerA2.remove();
      containerB.remove();
    }
  });

  it('resolves interrupt fallback through CopilotKit runAgent when stream resolver is unavailable', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.interruptState.activeInterrupt = {
      type: 'operator-config-request',
      message: 'Provide setup',
    };
    mocks.interruptState.canResolve = false;
    const rawAgentRun = vi.fn(async () => undefined);
    mocks.agent.runAgent = rawAgentRun;

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    latestValue?.resolveInterrupt({
      poolAddress: '0x0000000000000000000000000000000000000001',
      walletAddress: '0x0000000000000000000000000000000000000002',
      baseContributionUsd: 100,
    });
    await flushEffects();

    expect(mocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.agent,
        threadId: 'thread-1',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              poolAddress: '0x0000000000000000000000000000000000000001',
              walletAddress: '0x0000000000000000000000000000000000000002',
              baseContributionUsd: 100,
            }),
          },
        },
      }),
    );
    expect(rawAgentRun).not.toHaveBeenCalled();
    expect(latestValue?.uiError).toBeNull();
  });

  it('derives a persisted interrupt from synced thread activity when no stream interrupt is active', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-pi-example"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    subscriber?.onRunInitialized?.({
      input: { threadId: 'thread-1' },
      state: {
        thread: {
          task: {
            id: 'exec-1',
            taskStatus: {
              state: 'input-required',
              message: 'Provide a short operator note to continue.',
            },
          },
          activity: {
            events: [
              {
                type: 'dispatch-response',
                parts: [
                  {
                    kind: 'a2ui',
                    data: {
                      payload: {
                        kind: 'interrupt',
                        payload: {
                          type: 'operator-config-request',
                          message: 'Provide a short operator note to continue.',
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    });
    await flushEffects();
    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-pi-example"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.activeInterrupt).toEqual({
      type: 'operator-config-request',
      message: 'Provide a short operator note to continue.',
    });
  });

  it('derives a persisted interrupt from LangGraph task interrupts when synced activity has no A2UI payload', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;
    let subscriber: AgentSubscriber | undefined;

    mocks.agent.subscribe.mockImplementation((nextSubscriber) => {
      subscriber = nextSubscriber as AgentSubscriber;
      return {
        unsubscribe: vi.fn(),
      };
    });

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-gmx-allora"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    subscriber?.onRunInitialized?.({
      input: { threadId: 'thread-1' },
      state: {
        thread: {
          task: {
            id: 'exec-1',
            taskStatus: {
              state: 'input-required',
              message: 'Select the GMX market and enter the USDC allocation for low-leverage trades.',
            },
          },
          activity: {
            events: [
              {
                type: 'status',
                message: 'Awaiting market + allocation to continue onboarding.',
                task: {
                  id: 'exec-1',
                  taskStatus: {
                    state: 'input-required',
                  },
                },
              },
            ],
          },
        },
        tasks: [
          {
            interrupts: [
              {
                value: {
                  type: 'gmx-setup-request',
                  message: 'Select the GMX market and enter the USDC allocation for low-leverage trades.',
                  payloadSchema: {
                    type: 'object',
                  },
                },
              },
            ],
          },
        ],
      } as ReturnType<AgentSubscriber['onRunInitialized']> extends ((event: infer T) => unknown) ? T['state'] : never,
    });
    await flushEffects();
    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-gmx-allora"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    expect(latestValue?.activeInterrupt).toEqual({
      type: 'gmx-setup-request',
      message: 'Select the GMX market and enter the USDC allocation for low-leverage trades.',
      payloadSchema: {
        type: 'object',
      },
    });
  });

  it('routes Pi operator-note interrupt resolution through CopilotKit run orchestration with explicit resume payloads', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.interruptState.activeInterrupt = {
      type: 'operator-config-request',
      message: 'Provide a short operator note to continue.',
    };
    mocks.interruptState.canResolve = false;
    const rawAgentRun = vi.fn(async () => undefined);
    mocks.agent.runAgent = rawAgentRun;

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-pi-example"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    latestValue?.resolveInterrupt({
      operatorNote: 'Use the safe automation window',
    });
    await flushEffects();

    expect(mocks.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.agent,
        threadId: 'thread-1',
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              operatorNote: 'Use the safe automation window',
            }),
          },
        },
      }),
    );
    expect(rawAgentRun).not.toHaveBeenCalled();
    expect(latestValue?.uiError).toBeNull();
  });

  it('routes stream-backed interrupt resolution through scheduled CopilotKit run orchestration', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.interruptState.activeInterrupt = {
      type: 'gmx-delegation-signing-request',
      message: 'Review and approve the permissions needed to manage your GMX perps.',
      chainId: 42161,
      delegationManager: '0x0000000000000000000000000000000000000001',
      delegatorAddress: '0x0000000000000000000000000000000000000002',
      delegateeAddress: '0x0000000000000000000000000000000000000003',
      delegationsToSign: [
        {
          delegate: '0x0000000000000000000000000000000000000003',
          delegator: '0x0000000000000000000000000000000000000002',
          authority: '0x',
          caveats: [],
          salt: '0x01',
        },
      ],
      descriptions: ['delegate gmx actions'],
      warnings: [],
    };
    mocks.interruptState.canResolve = true;

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-gmx-allora"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    latestValue?.resolveInterrupt({
      outcome: 'signed',
      signedDelegations: [
        {
          delegate: '0x0000000000000000000000000000000000000003',
          delegator: '0x0000000000000000000000000000000000000002',
          authority: '0x',
          caveats: [],
          salt: '0x01',
          signature: '0x1234',
        },
      ],
    });
    await flushEffects();

    expect(mocks.runAgent).toHaveBeenCalledWith({
      agent: mocks.agent,
      threadId: 'thread-1',
      forwardedProps: {
        command: {
          resume: JSON.stringify({
            outcome: 'signed',
            signedDelegations: [
              {
                delegate: '0x0000000000000000000000000000000000000003',
                delegator: '0x0000000000000000000000000000000000000002',
                authority: '0x',
                caveats: [],
                salt: '0x01',
                signature: '0x1234',
              },
            ],
          }),
        },
      },
    });
    expect(mocks.interruptState.resolve).not.toHaveBeenCalled();
    expect(latestValue?.uiError).toBeNull();
  });

  it('surfaces an error when interrupt fallback cannot resume through CopilotKit runAgent', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.interruptState.activeInterrupt = {
      type: 'operator-config-request',
      message: 'Provide setup',
    };
    mocks.interruptState.canResolve = false;
    mocks.runAgent.mockRejectedValueOnce(new Error('resume failed'));

    await act(async () => {
      root.render(
        <CapturingHarness
          agentId="agent-clmm"
          onSnapshot={(value) => {
            latestValue = value;
          }}
        />,
      );
    });
    await flushEffects();

    latestValue?.resolveInterrupt({
      poolAddress: '0x0000000000000000000000000000000000000001',
      walletAddress: '0x0000000000000000000000000000000000000002',
      baseContributionUsd: 100,
    });
    await flushEffects();

    expect(latestValue?.uiError).toContain("Agent command 'resume' failed");
  });
});
