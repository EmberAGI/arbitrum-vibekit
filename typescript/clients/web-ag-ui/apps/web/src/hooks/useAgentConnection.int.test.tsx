// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentConnection } from './useAgentConnection';
import { __resetAgentStreamCoordinatorForTests } from '../utils/agentStreamCoordinator';

type TestAgent = {
  threadId: string | undefined;
  state: Record<string, unknown>;
  addMessage: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  detachActiveRun: ReturnType<typeof vi.fn>;
  connectAgent: ReturnType<typeof vi.fn>;
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
});
