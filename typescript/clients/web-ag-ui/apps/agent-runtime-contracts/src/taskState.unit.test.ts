import { describe, expect, it } from 'vitest';

import { TASK_STATES, isTaskActiveState, isTaskTerminalState } from './taskState.js';

describe('taskState', () => {
  it('recognizes terminal and active task states', () => {
    expect(isTaskTerminalState('completed')).toBe(true);
    expect(isTaskTerminalState('failed')).toBe(true);
    expect(isTaskTerminalState('canceled')).toBe(true);
    expect(isTaskTerminalState('not-a-task-state')).toBe(false);
    expect(isTaskTerminalState('working')).toBe(false);

    expect(isTaskActiveState('submitted')).toBe(true);
    expect(isTaskActiveState('input-required')).toBe(true);
    expect(isTaskActiveState('completed')).toBe(false);
  });

  it('exports the canonical runtime-neutral task-state vocabulary', () => {
    expect(TASK_STATES).toEqual([
      'submitted',
      'working',
      'input-required',
      'completed',
      'canceled',
      'failed',
      'auth-required',
    ]);
  });
});
