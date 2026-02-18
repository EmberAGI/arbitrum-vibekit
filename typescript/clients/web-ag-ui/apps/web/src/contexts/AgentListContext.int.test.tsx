// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentListProvider, useAgentList } from './AgentListContext';
import * as agentListPolling from './agentListPolling';

let pathname = '/hire-agents/agent-pendle';

vi.mock('@copilotkit/react-core/v2', () => ({
  ProxiedCopilotRuntimeAgent: class MockProxiedCopilotRuntimeAgent {
    constructor(_config: { runtimeUrl: string; agentId: string; threadId: string }) {}
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

vi.mock('../hooks/usePrivyWalletClient', () => ({
  usePrivyWalletClient: () => ({
    privyWallet: {
      address: '0x1111111111111111111111111111111111111111',
    },
  }),
}));

vi.mock('../config/agents', () => ({
  getAllAgents: () => [
    { id: 'agent-clmm' },
    { id: 'agent-pendle' },
    { id: 'agent-gmx-allora' },
    { id: 'agent-extra' },
  ],
  isRegisteredAgentId: (agentId: string) =>
    ['agent-clmm', 'agent-pendle', 'agent-gmx-allora', 'agent-extra'].includes(agentId),
}));

vi.mock('../utils/agentThread', () => ({
  getAgentThreadId: (agentId: string, walletKey: string | null | undefined) =>
    walletKey ? `${agentId}:${walletKey}` : null,
}));

vi.mock('./agentListPolling', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agentListPolling')>();
  return {
    ...actual,
    pollAgentIdsWithConcurrency: vi.fn(async () => undefined),
    pollAgentListUpdateViaAgUi: vi.fn(async () => null),
  };
});

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function CaptureAgentList({
  onSnapshot,
}: {
  onSnapshot: (value: ReturnType<typeof useAgentList>) => void;
}) {
  const value = useAgentList();
  onSnapshot(value);
  return null;
}

describe('AgentListProvider integration', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalPollMs = process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_POLL_MS;
  const originalMaxConcurrent = process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_MAX_CONCURRENT;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    pathname = '/hire-agents/agent-pendle';
    process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_POLL_MS = '10';
    process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_MAX_CONCURRENT = '2';
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_POLL_MS = originalPollMs;
    process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_MAX_CONCURRENT = originalMaxConcurrent;
    vi.useRealTimers();
  });

  it('passes all non-focused agents with configured max concurrency to poll batches', async () => {
    const pollWithConcurrencyMock = vi.mocked(agentListPolling.pollAgentIdsWithConcurrency);

    await act(async () => {
      root.render(
        <AgentListProvider>
          <div>child</div>
        </AgentListProvider>,
      );
    });
    await flushEffects();

    expect(pollWithConcurrencyMock).toHaveBeenCalled();
    const firstCall = pollWithConcurrencyMock.mock.calls[0]?.[0];
    expect(firstCall).toMatchObject({
      maxConcurrent: 2,
      agentIds: ['agent-clmm', 'agent-gmx-allora', 'agent-extra'],
    });
  });

  it('does not start a new periodic batch while the current periodic batch is still in flight', async () => {
    const pollWithConcurrencyMock = vi.mocked(agentListPolling.pollAgentIdsWithConcurrency);
    const pending = new Promise<void>(() => undefined);

    await act(async () => {
      root.render(
        <AgentListProvider>
          <div>child</div>
        </AgentListProvider>,
      );
    });
    await flushEffects();

    // Ignore the initial bootstrap batch and focus on periodic interval behavior.
    pollWithConcurrencyMock.mockClear();
    pollWithConcurrencyMock.mockImplementationOnce(async () => pending);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    expect(pollWithConcurrencyMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30);
    });
    expect(pollWithConcurrencyMock).toHaveBeenCalledTimes(1);
  });

  it('enforces per-agent source ownership for detail-connect vs poll updates', async () => {
    let latest: ReturnType<typeof useAgentList> | null = null;

    await act(async () => {
      root.render(
        <AgentListProvider>
          <CaptureAgentList
            onSnapshot={(value) => {
              latest = value;
            }}
          />
        </AgentListProvider>,
      );
    });
    await flushEffects();

    expect(latest).not.toBeNull();

    // Active detail route is agent-pendle, so poll updates for it must be ignored.
    latest?.upsertAgent('agent-pendle', { command: 'sync' }, 'poll');
    await flushEffects();
    expect(latest?.agents['agent-pendle']?.command).toBeUndefined();

    // Detail-connect is authoritative for active detail agent.
    latest?.upsertAgent('agent-pendle', { command: 'sync' }, 'detail-connect');
    await flushEffects();
    expect(latest?.agents['agent-pendle']?.command).toBe('sync');

    // Detail-connect updates for non-active agents must be ignored.
    latest?.upsertAgent('agent-clmm', { command: 'hire' }, 'detail-connect');
    await flushEffects();
    expect(latest?.agents['agent-clmm']?.command).toBeUndefined();
  });
});
