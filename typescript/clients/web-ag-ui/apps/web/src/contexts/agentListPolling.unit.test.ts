import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentSubscriber } from '@ag-ui/client';

import type { AgentState } from '../types/agent';
import {
  pollAgentListUpdateViaAgUi,
  resolveAgentListPollIntervalMs,
  selectAgentIdsForPolling,
} from './agentListPolling';
import type { AgentListEntry } from './agentListTypes';

describe('agentListPolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('selects all non-focused agents for periodic polling', () => {
    const agents: Record<string, AgentListEntry> = {
      'agent-clmm': { synced: true, taskState: 'working' },
      'agent-pendle': { synced: true, taskState: 'completed' },
      'agent-gmx-allora': { synced: true, taskState: 'input-required' },
    };

    const selected = selectAgentIdsForPolling({
      agentIds: ['agent-clmm', 'agent-pendle', 'agent-gmx-allora'],
      agents,
      activeAgentId: 'agent-gmx-allora',
    });

    expect(selected).toEqual(['agent-clmm', 'agent-pendle']);
  });

  it('includes agents that do not have task state yet', () => {
    const agents: Record<string, AgentListEntry> = {
      'agent-clmm': { synced: false },
      'agent-pendle': { synced: true, taskState: 'completed' },
      'agent-gmx-allora': { synced: true, taskState: 'working' },
    };

    const selected = selectAgentIdsForPolling({
      agentIds: ['agent-clmm', 'agent-pendle', 'agent-gmx-allora'],
      agents,
      activeAgentId: 'agent-gmx-allora',
    });

    expect(selected).toEqual(['agent-clmm', 'agent-pendle']);
  });

  it('uses 15 seconds as the default polling interval', () => {
    expect(resolveAgentListPollIntervalMs(undefined)).toBe(15_000);
    expect(resolveAgentListPollIntervalMs('0')).toBe(15_000);
    expect(resolveAgentListPollIntervalMs('-2')).toBe(15_000);
    expect(resolveAgentListPollIntervalMs('garbage')).toBe(15_000);
    expect(resolveAgentListPollIntervalMs('20000')).toBe(20_000);
  });

  it('projects state snapshot into list update and detaches the short-lived stream', async () => {
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);

    let stateSubscriber: AgentSubscriber | null = null;

    const runtimeAgent = {
      subscribe: vi.fn((subscriber: AgentSubscriber) => {
        stateSubscriber = subscriber;
        return { unsubscribe };
      }),
      connectAgent: vi.fn(async () => {
        const snapshotState: AgentState = {
          settings: {},
          view: {
            command: 'cycle',
            profile: {
              chains: ['Arbitrum'],
              protocols: ['Camelot'],
              tokens: ['USDC'],
              pools: [],
              allowedPools: [],
            },
            activity: { telemetry: [], events: [] },
            metrics: { iteration: 3, cyclesSinceRebalance: 1, staleCycles: 0 },
            task: {
              id: 'task-1',
              taskStatus: {
                state: 'working',
                message: { content: 'Cycling' },
              },
            },
            transactionHistory: [],
          },
        };

        stateSubscriber?.onStateSnapshotEvent?.({
          event: {
            type: 'STATE_SNAPSHOT',
            snapshot: snapshotState,
          },
        } as never);
      }),
      detachActiveRun,
    };

    const update = await pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 250,
      createRuntimeAgent: () => runtimeAgent,
    });

    expect(update).toMatchObject({
      synced: true,
      command: 'cycle',
      taskId: 'task-1',
      taskState: 'working',
      taskMessage: 'Cycling',
    });
    expect(runtimeAgent.connectAgent).toHaveBeenCalledTimes(1);
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('returns null when no snapshot arrives before timeout and still detaches stream', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);

    const runtimeAgent = {
      subscribe: vi.fn(() => ({ unsubscribe })),
      connectAgent: vi.fn(async () => undefined),
      detachActiveRun,
    };

    const promise = pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 100,
      createRuntimeAgent: () => runtimeAgent,
    });

    await vi.advanceTimersByTimeAsync(110);
    const update = await promise;

    expect(update).toBeNull();
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
