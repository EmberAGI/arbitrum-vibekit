import { describe, expect, it } from 'vitest';

import { mergeThreadPatchForEmit } from './threadEmission.js';

describe('threadEmission', () => {
  it('preserves stable onboarding keys when emit patch is partial', () => {
    const merged = mergeThreadPatchForEmit({
      currentThread: {
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
      patchThread: {
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

  it('applies invariant merge callback when provided', () => {
    type TestView = {
      onboarding?: { step: number; key?: string };
      onboardingFlow?: { activeStepId?: string };
    };

    const merged = mergeThreadPatchForEmit<TestView>({
      currentThread: {
        onboarding: { step: 2, key: 'funding-token' },
        onboardingFlow: { activeStepId: 'funding-token' },
      },
      patchThread: {
        onboarding: { step: 3, key: 'delegation-signing' },
      },
      mergeWithInvariants: (currentThread, patchThread) => ({
        ...currentThread,
        ...patchThread,
        onboardingFlow: {
          activeStepId: patchThread.onboarding?.key,
        },
      }),
    });

    expect(merged.onboarding?.key).toBe('delegation-signing');
    expect(merged.onboardingFlow?.activeStepId).toBe('delegation-signing');
  });
});
