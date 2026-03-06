import { describe, expect, it } from 'vitest';

import { projectAgentListUpdate } from './agentListProjection';

describe('agentListProjection', () => {
  it('projects task-backed runtime view state into sidebar list update', () => {
    const update = projectAgentListUpdate({
      profile: { chains: ['Arbitrum'], protocols: [], tokens: [], pools: [], allowedPools: [] },
      metrics: { iteration: 12, cyclesSinceRebalance: 1, staleCycles: 0 },
      task: {
        id: 'task-1',
        taskStatus: {
          state: 'working',
          message: { content: 'Rebalancing' },
        },
      },
      haltReason: 'none',
      executionError: 'none',
    });

    expect(update.synced).toBe(true);
    expect(update.taskId).toBe('task-1');
    expect(update.taskState).toBe('working');
    expect(update.taskMessage).toBe('Rebalancing');
    expect(update.haltReason).toBe('none');
    expect(update.executionError).toBe('none');
    expect(update.profile?.chains).toEqual(['Arbitrum']);
    expect(update.metrics?.iteration).toBe(12);
  });

  it('clears task fields when runtime view has no task', () => {
    const update = projectAgentListUpdate({
      profile: null,
      metrics: null,
      task: undefined,
      haltReason: 'should-clear',
      executionError: 'should-clear',
    });

    expect(update.synced).toBe(true);
    expect(update.taskId).toBeUndefined();
    expect(update.taskState).toBeUndefined();
    expect(update.taskMessage).toBeUndefined();
    expect(update.haltReason).toBeUndefined();
    expect(update.executionError).toBeUndefined();
  });
});
