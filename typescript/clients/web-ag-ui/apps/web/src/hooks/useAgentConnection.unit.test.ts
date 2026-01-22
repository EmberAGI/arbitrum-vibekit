// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentConfig } from '../config/agents';
import { buildStableThreadId } from '../../../agent-clmm/src/utils/threadId.js';

type StubAgent = {
  threadId?: string;
  state: unknown;
  addMessage: ReturnType<typeof vi.fn>;
  runAgent: ReturnType<typeof vi.fn>;
  connectAgent: ReturnType<typeof vi.fn>;
  setState: ReturnType<typeof vi.fn>;
  isRunning?: boolean;
};

const mockAgent: StubAgent = {
  state: {},
  addMessage: vi.fn(),
  runAgent: vi.fn(),
  connectAgent: vi.fn().mockResolvedValue(undefined),
  setState: vi.fn(),
  isRunning: false,
};

const mockUseAgent = vi.fn(() => ({ agent: mockAgent }));
const mockUsePrivyWalletClient = vi.fn(() => ({
  privyWallet: { address: '0xabc0000000000000000000000000000000000000' },
}));
const mockGetAgentConfig = vi.fn(
  (agentId: string) =>
    ({
      id: agentId,
      name: 'Test Agent',
      description: 'Test',
    }) satisfies AgentConfig,
);

vi.mock('@copilotkit/react-core/v2', () => ({
  useAgent: (params: { agentId: string }) => mockUseAgent(params),
}));

vi.mock('./usePrivyWalletClient', () => ({
  usePrivyWalletClient: () => mockUsePrivyWalletClient(),
}));

vi.mock('../config/agents', () => ({
  getAgentConfig: (agentId: string) => mockGetAgentConfig(agentId),
}));

vi.mock('../app/hooks/useLangGraphInterruptCustomUI', () => ({
  useLangGraphInterruptCustomUI: () => ({
    activeInterrupt: null,
    resolve: vi.fn(),
  }),
}));

describe('useAgentConnection', () => {
  beforeEach(() => {
    mockAgent.addMessage.mockReset();
    mockAgent.runAgent.mockReset();
    mockAgent.connectAgent.mockReset();
    mockUseAgent.mockClear();
    mockUsePrivyWalletClient.mockClear();
    mockGetAgentConfig.mockClear();

    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('attaches via connectAgent and does not start a run on initial mount', async () => {
    // Given the agent hook is mounted
    const { useAgentConnection } = await import('./useAgentConnection.js');
    await act(async () => {
      renderHook(() => useAgentConnection('agent-clmm'));
    });

    // Then it should attach via connectAgent without running a command
    expect(mockAgent.connectAgent).toHaveBeenCalledTimes(1);
    expect(mockAgent.runAgent).not.toHaveBeenCalled();
  });

  it('runSync uses connectAgent without invoking runAgent', async () => {
    const { useAgentConnection } = await import('./useAgentConnection.js');
    const { result } = renderHook(() => useAgentConnection('agent-clmm'));

    await act(async () => {
      result.current.runSync();
    });

    expect(mockAgent.connectAgent).toHaveBeenCalledTimes(2);
    expect(mockAgent.runAgent).not.toHaveBeenCalled();
  });

  it('derives the same thread id as the cron side for a wallet address', async () => {
    const { useAgentConnection } = await import('./useAgentConnection.js');
    const { result } = renderHook(() => useAgentConnection('agent-clmm'));

    const expected = buildStableThreadId(
      'agent-clmm',
      '0xabc0000000000000000000000000000000000000',
    );

    expect(result.current.threadId).toBe(expected);
  });

  it('queues user commands while a run is active and attaches instead of starting a new run', async () => {
    // Given an active run already in progress
    mockAgent.isRunning = true;
    const { useAgentConnection } = await import('./useAgentConnection.js');
    const { result } = renderHook(() => useAgentConnection('agent-clmm'));

    // When the user requests a hire while a run is active
    await act(async () => {
      result.current.runHire();
    });

    // Then it should attach without starting a new run
    expect(mockAgent.connectAgent).toHaveBeenCalled();
    expect(mockAgent.runAgent).not.toHaveBeenCalled();
  });
});
