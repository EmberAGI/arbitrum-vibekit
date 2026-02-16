import { describe, expect, it } from 'vitest';

import { applyAgentSyncToState, parseAgentSyncResponse } from './agentSync';
import { initialAgentState } from '../types/agent';

describe('agentSync', () => {
  it('applies profile/metrics/activity updates to the agent view', () => {
    const sync = parseAgentSyncResponse({
      agentId: 'agent-pendle',
      command: 'cycle',
      setupComplete: true,
      delegationsBypassActive: true,
      profile: { chains: ['arbitrum'] },
      metrics: { iteration: 7, cyclesSinceRebalance: 2, staleCycles: 0 },
      activity: { telemetry: [{ cycle: 7, action: 'hold', timestamp: '2026-02-05T00:00:00Z' }], events: [] },
      transactionHistory: [{ cycle: 7, action: 'hold', status: 'success', timestamp: '2026-02-05T00:00:00Z' }],
      task: { id: 'task-1', taskStatus: { state: 'working' } },
    });

    const next = applyAgentSyncToState(initialAgentState, sync);
    expect(next.view.command).toBe('cycle');
    expect(next.view.setupComplete).toBe(true);
    expect(next.view.delegationsBypassActive).toBe(true);
    expect(next.view.profile.chains).toEqual(['arbitrum']);
    expect(next.view.metrics.iteration).toBe(7);
    expect(next.view.activity.telemetry).toHaveLength(1);
    expect(next.view.transactionHistory).toHaveLength(1);
    expect(next.view.task?.id).toBe('task-1');
  });

  it('does not clobber existing values when sync omits optional fields', () => {
    const seeded = applyAgentSyncToState(
      initialAgentState,
      parseAgentSyncResponse({
        agentId: 'agent-pendle',
        command: 'hire',
        profile: { chains: ['arbitrum'] },
        metrics: { iteration: 1, cyclesSinceRebalance: 0, staleCycles: 0 },
        activity: { telemetry: [], events: [] },
        transactionHistory: [],
      }),
    );

    const next = applyAgentSyncToState(
      seeded,
      parseAgentSyncResponse({
        agentId: 'agent-pendle',
        metrics: { iteration: 2, cyclesSinceRebalance: 0, staleCycles: 0 },
      }),
    );

    expect(next.view.command).toBe('hire');
    expect(next.view.profile.chains).toEqual(['arbitrum']);
    expect(next.view.metrics.iteration).toBe(2);
  });
});
