import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentSubscriber } from '@ag-ui/client';

import type { ThreadSnapshot } from '../types/agent';
import {
  pollAgentIdsWithConcurrency,
  pollAgentListUpdateViaAgUi,
  resolveAgentListPollBusyCooldownMs,
  resolveAgentListPollIntervalMs,
  resolveAgentListPollMaxConcurrent,
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

  it('skips agents that are still inside busy cooldown window', () => {
    const selected = selectAgentIdsForPolling({
      agentIds: ['agent-clmm', 'agent-pendle', 'agent-gmx-allora'],
      agents: {
        'agent-clmm': { synced: true },
        'agent-pendle': { synced: true },
        'agent-gmx-allora': { synced: true },
      },
      activeAgentId: null,
      busyUntilByAgent: {
        'agent-pendle': 5_000,
      },
      nowMs: 4_000,
    });

    expect(selected).toEqual(['agent-clmm', 'agent-gmx-allora']);
  });

  it('uses 15 seconds as the default polling interval', () => {
    expect(resolveAgentListPollIntervalMs(undefined)).toBe(15_000);
    expect(resolveAgentListPollIntervalMs('0')).toBe(15_000);
    expect(resolveAgentListPollIntervalMs('-2')).toBe(15_000);
    expect(resolveAgentListPollIntervalMs('garbage')).toBe(15_000);
    expect(resolveAgentListPollIntervalMs('20000')).toBe(20_000);
  });

  it('uses sane defaults for max poll concurrency', () => {
    expect(resolveAgentListPollMaxConcurrent(undefined)).toBe(2);
    expect(resolveAgentListPollMaxConcurrent('0')).toBe(2);
    expect(resolveAgentListPollMaxConcurrent('-5')).toBe(2);
    expect(resolveAgentListPollMaxConcurrent('garbage')).toBe(2);
    expect(resolveAgentListPollMaxConcurrent('3.9')).toBe(3);
  });

  it('uses sane defaults for busy cooldown', () => {
    expect(resolveAgentListPollBusyCooldownMs(undefined)).toBe(30_000);
    expect(resolveAgentListPollBusyCooldownMs('0')).toBe(30_000);
    expect(resolveAgentListPollBusyCooldownMs('-50')).toBe(30_000);
    expect(resolveAgentListPollBusyCooldownMs('garbage')).toBe(30_000);
    expect(resolveAgentListPollBusyCooldownMs('60000')).toBe(60_000);
  });

  it('projects state snapshot into list update and detaches the short-lived stream', async () => {
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);
    const addMessage = vi.fn();

    let stateSubscriber: AgentSubscriber | null = null;

    const runtimeAgent = {
      subscribe: vi.fn((subscriber: AgentSubscriber) => {
        stateSubscriber = subscriber;
        return { unsubscribe };
      }),
      addMessage,
      runAgent: vi.fn(async () => {
        const snapshotState: ThreadSnapshot = {
          settings: {},
          thread: {
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
      connectAgent: vi.fn(async () => undefined),
      detachActiveRun,
    };

    const outcome = await pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 250,
      createRuntimeAgent: () => runtimeAgent,
    });

    expect(outcome.update).toMatchObject({
      synced: true,
      taskId: 'task-1',
      taskState: 'working',
      taskMessage: 'Cycling',
    });
    expect(outcome.busy).toBe(false);
    expect(addMessage).toHaveBeenCalledTimes(1);
    const addMessageArg = addMessage.mock.calls[0]?.[0] as { role?: string; content?: string } | undefined;
    expect(addMessageArg?.role).toBe('user');
    const parsedContent =
      typeof addMessageArg?.content === 'string'
        ? (JSON.parse(addMessageArg.content) as { command?: string; source?: string })
        : {};
    expect(parsedContent).toMatchObject({
      command: 'sync',
      source: 'agent-list-poll',
    });
    expect(runtimeAgent.runAgent).toHaveBeenCalledTimes(1);
    expect(runtimeAgent.connectAgent).not.toHaveBeenCalled();
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('returns null when no snapshot arrives before timeout and still detaches stream', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);

    const runtimeAgent = {
      subscribe: vi.fn(() => ({ unsubscribe })),
      addMessage: vi.fn(),
      runAgent: vi.fn(async () => undefined),
      detachActiveRun,
    };

    const promise = pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 100,
      createRuntimeAgent: () => runtimeAgent,
    });

    await vi.advanceTimersByTimeAsync(110);
    const outcome = await promise;

    expect(outcome).toEqual({ update: null, busy: false });
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('returns promptly after snapshot and marks busy when run does not terminate within grace period', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);
    let stateSubscriber: AgentSubscriber | null = null;

    const runtimeAgent = {
      subscribe: vi.fn((subscriber: AgentSubscriber) => {
        stateSubscriber = subscriber;
        return { unsubscribe };
      }),
      addMessage: vi.fn(),
      runAgent: vi.fn(async () => {
        stateSubscriber?.onStateSnapshotEvent?.({
          event: {
            type: 'STATE_SNAPSHOT',
            snapshot: {
              settings: {},
              thread: {
                command: 'sync',
                profile: {
                  chains: [],
                  protocols: [],
                  tokens: [],
                  pools: [],
                  allowedPools: [],
                },
                activity: { telemetry: [], events: [] },
                metrics: { iteration: 0, cyclesSinceRebalance: 0, staleCycles: 0 },
                transactionHistory: [],
              },
            } as ThreadSnapshot,
          },
        } as never);
        await new Promise<void>(() => undefined);
      }),
      detachActiveRun,
    };

    let settled = false;
    const pollPromise = pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 100,
      runCompletionTimeoutMs: 50,
      createRuntimeAgent: () => runtimeAgent,
    }).then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(60);
    const outcome = await pollPromise;

    expect(outcome.busy).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
  });

  it('uses a short default run-termination grace period after snapshot', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);
    let stateSubscriber: AgentSubscriber | null = null;

    const runtimeAgent = {
      subscribe: vi.fn((subscriber: AgentSubscriber) => {
        stateSubscriber = subscriber;
        return { unsubscribe };
      }),
      addMessage: vi.fn(),
      runAgent: vi.fn(async () => {
        stateSubscriber?.onStateSnapshotEvent?.({
          event: {
            type: 'STATE_SNAPSHOT',
            snapshot: {
              settings: {},
              thread: {
                command: 'sync',
                profile: {
                  chains: [],
                  protocols: [],
                  tokens: [],
                  pools: [],
                  allowedPools: [],
                },
                activity: { telemetry: [], events: [] },
                metrics: { iteration: 0, cyclesSinceRebalance: 0, staleCycles: 0 },
                transactionHistory: [],
              },
            } as ThreadSnapshot,
          },
        } as never);
        await new Promise<void>(() => undefined);
      }),
      detachActiveRun,
    };

    let settled = false;
    const pollPromise = pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 100,
      createRuntimeAgent: () => runtimeAgent,
    }).then((value) => {
      settled = true;
      return value;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1_200);
    expect(settled).toBe(true);

    const outcome = await pollPromise;
    expect(outcome.busy).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
  });

  it('returns the latest snapshot update observed during a run', async () => {
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);
    let stateSubscriber: AgentSubscriber | null = null;
    let resolveRun: (() => void) | null = null;

    const runtimeAgent = {
      subscribe: vi.fn((subscriber: AgentSubscriber) => {
        stateSubscriber = subscriber;
        return { unsubscribe };
      }),
      addMessage: vi.fn(),
      runAgent: vi.fn(async () => {
        stateSubscriber?.onStateSnapshotEvent?.({
          event: {
            type: 'STATE_SNAPSHOT',
            snapshot: {
              settings: {},
              thread: {
                command: 'hire',
                profile: {
                  chains: [],
                  protocols: [],
                  tokens: [],
                  pools: [],
                  allowedPools: [],
                },
                activity: { telemetry: [], events: [] },
                metrics: { iteration: 0, cyclesSinceRebalance: 0, staleCycles: 0 },
                task: {
                  id: 'task-setup',
                  taskStatus: {
                    state: 'input-required',
                    message: { content: 'Waiting for delegation approval to continue onboarding.' },
                  },
                },
                transactionHistory: [],
              },
            } as ThreadSnapshot,
          },
        } as never);

        await Promise.resolve();

        stateSubscriber?.onStateSnapshotEvent?.({
          event: {
            type: 'STATE_SNAPSHOT',
            snapshot: {
              settings: {},
              thread: {
                command: 'cycle',
                profile: {
                  chains: [],
                  protocols: [],
                  tokens: [],
                  pools: [],
                  allowedPools: [],
                },
                activity: { telemetry: [], events: [] },
                metrics: { iteration: 1, cyclesSinceRebalance: 1, staleCycles: 0 },
                task: {
                  id: 'task-cycle',
                  taskStatus: {
                    state: 'working',
                    message: { content: 'Executing cycle' },
                  },
                },
                transactionHistory: [],
              },
            } as ThreadSnapshot,
          },
        } as never);

        await new Promise<void>((resolve) => {
          resolveRun = resolve;
        });
      }),
      detachActiveRun,
    };

    const pollPromise = pollAgentListUpdateViaAgUi({
      agentId: 'agent-gmx-allora',
      threadId: 'thread-gmx',
      timeoutMs: 250,
      runCompletionTimeoutMs: 2_000,
      createRuntimeAgent: () => runtimeAgent,
    });

    await Promise.resolve();
    await Promise.resolve();
    resolveRun?.();

    const outcome = await pollPromise;

    expect(outcome.busy).toBe(false);
    expect(outcome.update).toMatchObject({
      taskId: 'task-cycle',
      taskState: 'working',
      taskMessage: 'Executing cycle',
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
  });

  it('returns null and still detaches stream when poll run rejects', async () => {
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);

    const runtimeAgent = {
      subscribe: vi.fn(() => ({ unsubscribe })),
      addMessage: vi.fn(),
      runAgent: vi.fn(async () => {
        throw new Error('poll failed');
      }),
      detachActiveRun,
    };

    const outcome = await pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 100,
      createRuntimeAgent: () => runtimeAgent,
    });

    expect(outcome).toEqual({ update: null, busy: false });
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('marks result as busy when poll run rejects with busy error', async () => {
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);

    const runtimeAgent = {
      subscribe: vi.fn(() => ({ unsubscribe })),
      addMessage: vi.fn(),
      runAgent: vi.fn(async () => {
        throw new Error('Thread already running');
      }),
      detachActiveRun,
    };

    const outcome = await pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 100,
      createRuntimeAgent: () => runtimeAgent,
    });

    expect(outcome).toEqual({ update: null, busy: true });
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('marks result as busy when run does not terminate before completion timeout', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const detachActiveRun = vi.fn().mockResolvedValue(undefined);

    const runtimeAgent = {
      subscribe: vi.fn(() => ({ unsubscribe })),
      addMessage: vi.fn(),
      runAgent: vi.fn(async () => {
        await new Promise<void>(() => undefined);
      }),
      detachActiveRun,
    };

    const promise = pollAgentListUpdateViaAgUi({
      agentId: 'agent-clmm',
      threadId: 'thread-1',
      timeoutMs: 50,
      runCompletionTimeoutMs: 100,
      createRuntimeAgent: () => runtimeAgent,
    });

    await vi.advanceTimersByTimeAsync(160);
    const outcome = await promise;

    expect(outcome).toEqual({ update: null, busy: true });
    expect(detachActiveRun).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('runs agent polls with a bounded concurrency cap', async () => {
    const started: string[] = [];
    const resolvers: Array<() => void> = [];
    let active = 0;
    let peakActive = 0;

    const pollAgent = vi.fn((agentId: string) => {
      started.push(agentId);
      active += 1;
      peakActive = Math.max(peakActive, active);
      return new Promise<void>((resolve) => {
        resolvers.push(() => {
          active -= 1;
          resolve();
        });
      });
    });

    const runPromise = pollAgentIdsWithConcurrency({
      agentIds: ['agent-clmm', 'agent-pendle', 'agent-gmx-allora', 'agent-extra'],
      maxConcurrent: 2,
      pollAgent,
    });

    await Promise.resolve();
    expect(started).toEqual(['agent-clmm', 'agent-pendle']);
    expect(peakActive).toBe(2);

    resolvers.shift()?.();
    await Promise.resolve();
    expect(started).toEqual(['agent-clmm', 'agent-pendle', 'agent-gmx-allora']);

    resolvers.shift()?.();
    await Promise.resolve();
    expect(started).toEqual(['agent-clmm', 'agent-pendle', 'agent-gmx-allora', 'agent-extra']);

    while (resolvers.length > 0) {
      resolvers.shift()?.();
    }
    await runPromise;
    expect(peakActive).toBe(2);
  });
});
