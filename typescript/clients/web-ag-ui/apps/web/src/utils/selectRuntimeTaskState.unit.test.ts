import { describe, expect, it } from 'vitest';

import { selectRuntimeTaskState } from './selectRuntimeTaskState';

describe('selectRuntimeTaskState', () => {
  it('prefers the VM-projected effective task state when present', () => {
    const resolved = selectRuntimeTaskState({
      lifecyclePhase: 'firing',
      taskState: 'failed',
      taskMessage: null,
      effectiveTaskState: 'completed',
    });

    expect(resolved).toBe('completed');
  });

  it('falls back to raw lifecycle/task signals when selectors are missing', () => {
    const resolved = selectRuntimeTaskState({
      lifecyclePhase: 'firing',
      taskState: 'failed',
      taskMessage: 'AbortError: interrupt while preempting active run',
      effectiveTaskState: null,
    });

    expect(resolved).toBe('completed');
  });
});
