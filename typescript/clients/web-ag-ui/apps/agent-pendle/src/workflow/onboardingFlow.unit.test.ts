import { describe, expect, it } from 'vitest';

import { derivePendleOnboardingFlow } from './onboardingFlow.js';

describe('derivePendleOnboardingFlow', () => {
  it('maps reduced Pendle flow to funding amount + delegation signing', () => {
    const flow = derivePendleOnboardingFlow({
      onboarding: { step: 2, key: 'delegation-signing' },
      previous: undefined,
      setupComplete: false,
      taskState: 'input-required',
      delegationsBypassActive: false,
    });

    expect(flow?.status).toBe('in_progress');
    expect(flow?.activeStepId).toBe('delegation-signing');
    expect(flow?.steps.map((step) => step.title)).toEqual([
      'Funding Amount',
      'Delegation Signing',
    ]);
  });

  it('finalizes an existing flow when setup is complete', () => {
    const inProgress = derivePendleOnboardingFlow({
      onboarding: { step: 1, key: 'funding-amount' },
      previous: undefined,
      setupComplete: false,
      taskState: 'working',
      delegationsBypassActive: false,
    });
    const completed = derivePendleOnboardingFlow({
      onboarding: undefined,
      previous: inProgress,
      setupComplete: true,
      taskState: 'completed',
      delegationsBypassActive: false,
    });

    expect(completed?.status).toBe('completed');
    expect(completed?.activeStepId).toBeUndefined();
  });
});
