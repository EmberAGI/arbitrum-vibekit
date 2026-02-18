// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSubscriber } from '@ag-ui/client';

import { useAgentConnection } from './useAgentConnection';
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
    reset() {
      this.runtimeStatus = this.runtimeStatuses.Connected;
      this.threadId = 'thread-1';
      this.agent = createAgent();
      this.connectAgent.mockReset();
      this.connectAgent.mockImplementation(async () => undefined);
      this.runAgent.mockReset();
      this.runAgent.mockImplementation(async () => undefined);
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
    },
  }),
}));

vi.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ threadId: mocks.threadId }),
  useLangGraphInterruptRender: () => null,
}));

vi.mock('../app/hooks/useLangGraphInterruptCustomUI', () => ({
  useLangGraphInterruptCustomUI: () => ({
    activeInterrupt: null,
    canResolve: () => false,
    resolve: vi.fn(),
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
    expect(mocks.agent.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: JSON.stringify({ command: 'sync' }),
      }),
    );
    expect(mocks.runAgent).toHaveBeenCalledWith({ agent: mocks.agent });
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
});
