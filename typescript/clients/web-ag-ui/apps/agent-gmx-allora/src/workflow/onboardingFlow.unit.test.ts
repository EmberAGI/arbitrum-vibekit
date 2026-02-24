import { describe, expect, it } from 'vitest';

import { deriveGmxOnboardingFlow } from './onboardingFlow.js';

describe('deriveGmxOnboardingFlow', () => {
  it('does not add a synthetic fund-wallet onboarding step', () => {
    const flow = deriveGmxOnboardingFlow({
      onboarding: { step: 4, key: 'fund-wallet' },
      previous: undefined,
      taskState: 'input-required',
      setupComplete: false,
      delegationsBypassActive: false,
    });

    expect(flow?.steps.map((step) => step.id)).toEqual([
      'setup',
      'funding-token',
      'delegation-signing',
    ]);
    expect(flow?.activeStepId).toBe('delegation-signing');
    expect(flow?.key).toBe('delegation-signing');
  });
});
