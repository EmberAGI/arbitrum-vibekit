import { describe, expect, it } from 'vitest';

import { resolveSetupSteps } from './agentSetupSteps';

describe('agentSetupSteps', () => {
  it('returns no setup steps when onboarding flow metadata is absent', () => {
    const steps = resolveSetupSteps({});
    expect(steps).toEqual([]);
  });

  it('maps setup steps from the agent-provided onboarding flow', () => {
    const steps = resolveSetupSteps({
      onboardingFlow: {
        status: 'in_progress',
        revision: 2,
        activeStepId: 'delegation-signing',
        steps: [
          {
            id: 'funding-amount',
            title: 'Funding Amount',
            description: 'Set allocation',
            status: 'completed',
          },
          {
            id: 'delegation-signing',
            title: 'Delegation Signing',
            description: 'Sign policies',
            status: 'active',
          },
        ],
      },
    });

    expect(steps).toEqual([
      { id: 1, name: 'Funding Amount', description: 'Set allocation' },
      { id: 2, name: 'Delegation Signing', description: 'Sign policies' },
    ]);
  });

  it('uses default helper text when an onboarding flow step omits description', () => {
    const steps = resolveSetupSteps({
      onboardingFlow: {
        status: 'in_progress',
        revision: 1,
        activeStepId: 'setup',
        steps: [{ id: 'setup', title: 'Setup', status: 'active' }],
      },
    });

    expect(steps[0]?.description).toBe('Follow the next agent prompt to continue onboarding.');
  });
});
