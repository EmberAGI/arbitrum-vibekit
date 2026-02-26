import { describe, expect, it } from 'vitest';

import { resolveOnboardingPhase } from './onboardingStateMachine';

describe('resolveOnboardingPhase', () => {
  it('returns collect-pool-catalog when a pool catalog is required but missing', () => {
    expect(
      resolveOnboardingPhase({
        requiresPoolCatalog: true,
        hasPoolCatalog: false,
        hasSetupInput: false,
        hasFundingTokenInput: false,
        requiresDelegationSigning: false,
        hasDelegationBundle: false,
        hasOperatorConfig: false,
      }),
    ).toBe('collect-pool-catalog');
  });

  it('orders setup, funding token, delegations, and operator config phases', () => {
    expect(
      resolveOnboardingPhase({
        hasSetupInput: false,
        hasFundingTokenInput: false,
        requiresDelegationSigning: false,
        hasDelegationBundle: false,
        hasOperatorConfig: false,
      }),
    ).toBe('collect-setup-input');

    expect(
      resolveOnboardingPhase({
        hasSetupInput: true,
        hasFundingTokenInput: false,
        requiresDelegationSigning: false,
        hasDelegationBundle: false,
        hasOperatorConfig: false,
      }),
    ).toBe('collect-funding-token');

    expect(
      resolveOnboardingPhase({
        hasSetupInput: true,
        hasFundingTokenInput: true,
        requiresDelegationSigning: true,
        hasDelegationBundle: false,
        hasOperatorConfig: false,
      }),
    ).toBe('collect-delegations');

    expect(
      resolveOnboardingPhase({
        hasSetupInput: true,
        hasFundingTokenInput: true,
        requiresDelegationSigning: true,
        hasDelegationBundle: true,
        hasOperatorConfig: false,
      }),
    ).toBe('prepare-operator');
  });

  it('returns ready when all requirements are satisfied', () => {
    expect(
      resolveOnboardingPhase({
        hasSetupInput: true,
        hasFundingTokenInput: true,
        requiresDelegationSigning: false,
        hasDelegationBundle: false,
        hasOperatorConfig: true,
      }),
    ).toBe('ready');
  });

  it('keeps prepare-operator until setupComplete when completion is required', () => {
    expect(
      resolveOnboardingPhase({
        hasSetupInput: true,
        hasFundingTokenInput: true,
        requiresDelegationSigning: false,
        hasDelegationBundle: false,
        hasOperatorConfig: true,
        requiresSetupComplete: true,
        setupComplete: false,
      }),
    ).toBe('prepare-operator');

    expect(
      resolveOnboardingPhase({
        hasSetupInput: true,
        hasFundingTokenInput: true,
        requiresDelegationSigning: false,
        hasDelegationBundle: false,
        hasOperatorConfig: true,
        requiresSetupComplete: true,
        setupComplete: true,
      }),
    ).toBe('ready');
  });
});
