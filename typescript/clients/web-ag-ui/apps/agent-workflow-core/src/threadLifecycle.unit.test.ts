import { describe, expect, it } from 'vitest';

import { resolveThreadLifecyclePhase } from './index';

describe('threadLifecycle', () => {
  it('defaults to prehire when no lifecycle signals are present', () => {
    expect(resolveThreadLifecyclePhase({})).toBe('prehire');
  });

  it('returns onboarding when onboarding flow is in progress', () => {
    expect(
      resolveThreadLifecyclePhase({
        onboardingFlowStatus: 'in_progress',
      }),
    ).toBe('onboarding');
  });

  it('returns active when setup or onboarding completion is observed', () => {
    expect(
      resolveThreadLifecyclePhase({
        onboardingFlowStatus: 'completed',
      }),
    ).toBe('active');

    expect(
      resolveThreadLifecyclePhase({
        hasOperatorConfig: true,
      }),
    ).toBe('active');
  });

  it('returns firing while fire is requested and task is not terminal', () => {
    expect(
      resolveThreadLifecyclePhase({
        previousPhase: 'active',
        fireRequested: true,
        taskState: 'working',
      }),
    ).toBe('firing');
  });

  it('moves to inactive after firing reaches a terminal task state', () => {
    expect(
      resolveThreadLifecyclePhase({
        previousPhase: 'firing',
        taskState: 'completed',
      }),
    ).toBe('inactive');
  });

  it('does not regress onboarding to prehire when explicit lifecycle is stale', () => {
    expect(
      resolveThreadLifecyclePhase({
        previousPhase: 'onboarding',
        explicitLifecyclePhase: 'prehire',
      }),
    ).toBe('onboarding');
  });

  it('does not regress active to onboarding when explicit lifecycle is stale', () => {
    expect(
      resolveThreadLifecyclePhase({
        previousPhase: 'active',
        explicitLifecyclePhase: 'onboarding',
        onboardingFlowStatus: 'in_progress',
      }),
    ).toBe('active');
  });
});
