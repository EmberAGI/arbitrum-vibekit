import { describe, expect, it } from 'vitest';

import { deriveClmmOnboardingFlow } from './onboardingFlow.js';

describe('deriveClmmOnboardingFlow', () => {
  it('maps reduced non-bypass flow to setup + delegation signing', () => {
    const flow = deriveClmmOnboardingFlow({
      onboarding: { step: 2, key: 'delegation-signing' },
      previous: undefined,
      taskState: 'input-required',
      delegationsBypassActive: false,
      setupComplete: false,
    });

    expect(flow?.steps.map((step) => step.id)).toEqual(['setup', 'delegation-signing']);
    expect(flow?.activeStepId).toBe('delegation-signing');
  });

  it('maps reduced bypass flow to setup + funding token', () => {
    const flow = deriveClmmOnboardingFlow({
      onboarding: { step: 2, key: 'funding-token' },
      previous: undefined,
      taskState: 'input-required',
      delegationsBypassActive: true,
      setupComplete: false,
    });

    expect(flow?.steps.map((step) => step.id)).toEqual(['setup', 'funding-token']);
  });
});
