import { describe, expect, it } from 'vitest';

import { resolveSetupSteps } from './agentSetupSteps';

describe('agentSetupSteps', () => {
  it('uses Pendle-specific setup copy by agent id', () => {
    const steps = resolveSetupSteps({
      agentId: 'agent-pendle',
      totalSteps: 3,
    });

    expect(steps.map((step) => step.name)).toEqual([
      'Funding Amount',
      'Funding Token',
      'Delegation Signing',
    ]);
  });

  it('defaults GMX fund-wallet flow to four steps when interrupt requires wallet funding', () => {
    const steps = resolveSetupSteps({
      agentId: 'agent-gmx-allora',
      interruptType: 'gmx-fund-wallet-request',
    });

    expect(steps).toHaveLength(4);
    expect(steps[3]?.name).toBe('Fund Wallet');
  });

  it('overrides the onboarding step kind to fund-wallet when onboarding key says so', () => {
    const steps = resolveSetupSteps({
      agentId: 'agent-clmm',
      totalSteps: 3,
      onboardingStep: 2,
      onboardingKey: 'fund-wallet',
    });

    expect(steps[1]?.name).toBe('Fund Wallet');
  });
});
