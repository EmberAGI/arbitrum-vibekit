import { describe, expect, it } from 'vitest';

import { resolveCurrentSetupStep } from './agentCurrentSetupStep';

describe('agentCurrentSetupStep', () => {
  it('uses onboardingFlow.activeStepId when available', () => {
    const step = resolveCurrentSetupStep({
      maxSetupStep: 3,
      onboardingFlow: {
        status: 'in_progress',
        revision: 4,
        activeStepId: 'delegation-signing',
        steps: [
          { id: 'setup', title: 'Strategy Config', status: 'completed' },
          { id: 'funding-token', title: 'Funding Token', status: 'completed' },
          { id: 'delegation-signing', title: 'Delegation Signing', status: 'active' },
        ],
      },
    });

    expect(step).toBe(3);
  });

  it('falls back to onboardingFlow active status when activeStepId is absent', () => {
    const step = resolveCurrentSetupStep({
      maxSetupStep: 3,
      onboardingFlow: {
        status: 'in_progress',
        revision: 4,
        steps: [
          { id: 'setup', title: 'Strategy Config', status: 'completed' },
          { id: 'funding-token', title: 'Funding Token', status: 'active' },
          { id: 'delegation-signing', title: 'Delegation Signing', status: 'pending' },
        ],
      },
    });

    expect(step).toBe(2);
  });

  it('falls back to onboarding.step and clamps to setup-step bounds', () => {
    const step = resolveCurrentSetupStep({
      maxSetupStep: 2,
      onboarding: { step: 5, key: 'delegation-signing' },
    });

    expect(step).toBe(2);
  });

  it('defaults to step 1 when no onboarding metadata is available', () => {
    const step = resolveCurrentSetupStep({
      maxSetupStep: 3,
    });

    expect(step).toBe(1);
  });
});
