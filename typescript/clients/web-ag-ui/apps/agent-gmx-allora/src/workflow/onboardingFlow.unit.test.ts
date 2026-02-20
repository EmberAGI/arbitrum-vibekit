import { describe, expect, it } from 'vitest';

import { deriveGmxOnboardingFlow } from './onboardingFlow.js';

describe('deriveGmxOnboardingFlow', () => {
  it('adds fund-wallet step for 4-step flow', () => {
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
      'fund-wallet',
    ]);
    expect(flow?.activeStepId).toBe('fund-wallet');
  });
});
