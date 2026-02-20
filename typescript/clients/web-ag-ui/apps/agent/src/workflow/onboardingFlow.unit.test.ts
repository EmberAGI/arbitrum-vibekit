import { describe, expect, it } from 'vitest';

import { deriveStarterOnboardingFlow } from './onboardingFlow.js';

describe('deriveStarterOnboardingFlow', () => {
  it('builds 3-step default starter onboarding flow', () => {
    const flow = deriveStarterOnboardingFlow({
      onboarding: { step: 2, key: 'funding-token' },
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
    expect(flow?.activeStepId).toBe('funding-token');
  });
});
