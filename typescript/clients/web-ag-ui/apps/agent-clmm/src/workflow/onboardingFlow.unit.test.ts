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

  it('does not bump revision when onboarding checkpoint is unchanged', () => {
    const previous = deriveClmmOnboardingFlow({
      onboarding: { step: 2, key: 'funding-token' },
      previous: undefined,
      taskState: 'input-required',
      delegationsBypassActive: false,
      setupComplete: false,
    });

    const next = deriveClmmOnboardingFlow({
      onboarding: { step: 2, key: 'funding-token' },
      previous,
      taskState: 'input-required',
      delegationsBypassActive: false,
      setupComplete: false,
    });

    expect(previous).toBeDefined();
    expect(next).toBeDefined();
    expect(next?.revision).toBe(previous?.revision);
    expect(next).toEqual(previous);
  });
});
