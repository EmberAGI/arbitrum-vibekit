import { describe, expect, it } from 'vitest';

import { mergeViewPatchForEmit } from './viewEmission.js';

describe('viewEmission', () => {
  it('preserves stable onboarding keys when emit patch is partial', () => {
    const merged = mergeViewPatchForEmit({
      currentView: {
        command: 'hire',
        onboarding: { step: 2, key: 'funding-token' },
        onboardingFlow: {
          status: 'in_progress',
          revision: 3,
          activeStepId: 'funding-token',
          steps: [{ id: 'funding-token', title: 'Funding Token', status: 'active' }],
        },
        task: {
          id: 'task-1',
          taskStatus: { state: 'input-required' },
        },
        activity: {
          telemetry: [{ cycle: 1 }],
          events: [{ type: 'status' }],
        },
      },
      patchView: {
        task: {
          id: 'task-1',
          taskStatus: { state: 'working' },
        },
        activity: {
          events: [{ type: 'status', message: 'continuing' }],
        },
      },
    });

    expect(merged.command).toBe('hire');
    expect(merged.onboarding).toEqual({ step: 2, key: 'funding-token' });
    expect(merged.onboardingFlow?.status).toBe('in_progress');
    expect(merged.task?.taskStatus?.state).toBe('working');
    expect(Array.isArray(merged.activity?.telemetry)).toBe(true);
  });
});
