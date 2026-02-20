// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSubscriber } from '@ag-ui/client';

import { useAgentConnection } from './useAgentConnection';
import type { AgentInterrupt } from '../types/agent';
import { __resetAgentStreamCoordinatorForTests } from '../utils/agentStreamCoordinator';

type TestAgent = {
  threadId: string | undefined;
  state: Record<string, unknown>;
  addMessage: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
  subscribe: (subscriber: AgentSubscriber) => { unsubscribe: () => void };
  detachActiveRun: ReturnType<typeof vi.fn>;
  connectAgent: ReturnType<typeof vi.fn>;
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
    agent: createAgent(),
    connectAgent: vi.fn(async () => undefined),
    runAgent: vi.fn(async () => undefined),
    stopAgent: vi.fn(() => undefined),
    interruptState: {
      activeInterrupt: null as AgentInterrupt | null,
      canResolve: false,
      resolve: vi.fn(),
    },
    reset() {
      this.runtimeStatus = this.runtimeStatuses.Connected;
      this.threadId = 'thread-1';
      this.agent = createAgent();
      this.connectAgent.mockReset();
      this.connectAgent.mockImplementation(async () => undefined);
      this.runAgent.mockReset();
      this.runAgent.mockImplementation(async () => undefined);
      this.stopAgent.mockReset();
      this.stopAgent.mockImplementation(() => undefined);
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

  beforeEach(() => {
    __resetAgentStreamCoordinatorForTests();
    mocks.reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
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
    expect(mocks.runAgent).toHaveBeenCalledWith({ agent: mocks.agent });
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
        view: {
          command: 'cycle',
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
      state: { view: { command: 'cycle' } },
      input: { threadId: 'stale-thread' },
    });
    await flushEffects();
    expect(mocks.agent.setState).not.toHaveBeenCalled();

    subscriber?.onRunInitialized?.({
      state: { view: { command: 'cycle' } },
      input: { threadId: 'thread-1' },
    });
    await flushEffects();
    expect(mocks.agent.setState).toHaveBeenCalledTimes(1);
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

    expect(mocks.agent.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: JSON.stringify({ command: 'hire' }),
      }),
    );
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

    expect(mocks.agent.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: JSON.stringify({ command: 'hire' }),
      }),
    );
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

  it('preempts active run ownership via stopAgent before dispatching fire', async () => {
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

    expect(mocks.stopAgent).toHaveBeenCalledWith({ agent: mocks.agent });
    expect(mocks.agent.detachActiveRun.mock.calls.length).toBeGreaterThanOrEqual(1);
    subscriber?.onRunFinishedEvent?.({ input: { threadId: 'thread-1' } });
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    await flushEffects();
    await flushEffects();

    expect(mocks.agent.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: JSON.stringify({ command: 'fire' }),
      }),
    );
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

  it('resolves interrupt fallback through agent.runAgent when stream resolver is unavailable', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.interruptState.activeInterrupt = {
      type: 'operator-config-request',
      message: 'Provide setup',
    };
    mocks.interruptState.canResolve = false;
    const resumeRun = vi.fn(async () => undefined);
    mocks.agent.runAgent = resumeRun;

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

    expect(resumeRun).toHaveBeenCalledWith({
      forwardedProps: {
        command: {
          resume: JSON.stringify({
            poolAddress: '0x0000000000000000000000000000000000000001',
            walletAddress: '0x0000000000000000000000000000000000000002',
            baseContributionUsd: 100,
          }),
        },
      },
    });
    expect(latestValue?.uiError).toBeNull();
  });

  it('surfaces an error when interrupt fallback cannot resume through agent.runAgent', async () => {
    let latestValue: ReturnType<typeof useAgentConnection> | null = null;

    mocks.interruptState.activeInterrupt = {
      type: 'operator-config-request',
      message: 'Provide setup',
    };
    mocks.interruptState.canResolve = false;
    delete mocks.agent.runAgent;

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
