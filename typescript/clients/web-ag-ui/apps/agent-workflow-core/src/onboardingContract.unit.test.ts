import { describe, expect, it } from 'vitest';

import {
  buildOnboardingContractFromLegacyStep,
  finalizeOnboardingContract,
  normalizeLegacyOnboardingState,
} from './onboardingContract.js';

describe('onboardingContract', () => {
  it('builds in-progress step statuses from legacy step index', () => {
    const contract = buildOnboardingContractFromLegacyStep({
      status: 'in_progress',
      step: 2,
      key: 'funding-token',
      stepDefinitions: [
        { id: 'setup', title: 'Setup' },
        { id: 'funding-token', title: 'Funding Token' },
        { id: 'delegations', title: 'Delegation Signing' },
      ],
    });

    expect(contract.status).toBe('in_progress');
    expect(contract.activeStepId).toBe('funding-token');
    expect(contract.steps.map((step) => [step.id, step.status])).toEqual([
      ['setup', 'completed'],
      ['funding-token', 'active'],
      ['delegations', 'pending'],
    ]);
  });

  it('throws when step definition ids are duplicated', () => {
    expect(() =>
      buildOnboardingContractFromLegacyStep({
        status: 'in_progress',
        step: 1,
        stepDefinitions: [
          { id: 'setup', title: 'Setup' },
          { id: 'setup', title: 'Setup (duplicate)' },
        ],
      }),
    ).toThrow('Duplicate onboarding step id');
  });

  it('finalizes onboarding by completing all remaining steps', () => {
    const inProgress = buildOnboardingContractFromLegacyStep({
      status: 'in_progress',
      step: 2,
      stepDefinitions: [
        { id: 'setup', title: 'Setup' },
        { id: 'funding-token', title: 'Funding Token' },
        { id: 'delegations', title: 'Delegation Signing' },
      ],
    });

    const completed = finalizeOnboardingContract(inProgress, 'completed');

    expect(completed.status).toBe('completed');
    expect(completed.activeStepId).toBeUndefined();
    expect(completed.steps.every((step) => step.status === 'completed')).toBe(true);
  });

  it('clears legacy onboarding state once contract is terminal', () => {
    const normalized = normalizeLegacyOnboardingState({
      onboarding: { step: 4, key: 'fund-wallet' },
      onboardingFlow: { status: 'completed' },
    });

    expect(normalized).toBeUndefined();
  });

  it('preserves legacy onboarding state while contract is in progress', () => {
    const normalized = normalizeLegacyOnboardingState({
      onboarding: { step: 2, key: 'funding-token' },
      onboardingFlow: { status: 'in_progress' },
    });

    expect(normalized).toEqual({ step: 2, key: 'funding-token' });
  });
});
