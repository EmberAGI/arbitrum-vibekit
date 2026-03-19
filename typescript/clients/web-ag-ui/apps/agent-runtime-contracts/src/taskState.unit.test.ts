import { describe, expect, it } from 'vitest';

import { TASK_STATES, isTaskActiveState, isTaskTerminalState } from './taskState.js';

describe('taskState', () => {
  it('recognizes terminal, active, and non-actionable A2A task states', () => {
    expect(isTaskTerminalState('completed')).toBe(true);
    expect(isTaskTerminalState('failed')).toBe(true);
    expect(isTaskTerminalState('canceled')).toBe(true);
    expect(isTaskTerminalState('rejected')).toBe(true);
    expect(isTaskTerminalState('unknown')).toBe(false);
    expect(isTaskTerminalState('not-a-task-state')).toBe(false);
    expect(isTaskTerminalState('working')).toBe(false);

    expect(isTaskActiveState('submitted')).toBe(true);
    expect(isTaskActiveState('input-required')).toBe(true);
    expect(isTaskActiveState('unknown')).toBe(false);
    expect(isTaskActiveState('rejected')).toBe(false);
    expect(isTaskActiveState('completed')).toBe(false);
  });

  it('exports the canonical A2A task-state vocabulary', () => {
    expect(TASK_STATES).toEqual([
      'submitted',
      'working',
      'input-required',
      'completed',
      'canceled',
      'failed',
      'rejected',
      'auth-required',
      'unknown',
    ]);
  });
});
