export type OnboardingPhase =
  | 'collect-pool-catalog'
  | 'collect-setup-input'
  | 'collect-funding-token'
  | 'collect-delegations'
  | 'prepare-operator'
  | 'ready';

export interface ResolveOnboardingPhaseInput {
  requiresPoolCatalog?: boolean;
  hasPoolCatalog?: boolean;
  hasSetupInput: boolean;
  hasFundingTokenInput: boolean;
  requiresDelegationSigning: boolean;
  hasDelegationBundle: boolean;
  hasOperatorConfig: boolean;
  requiresSetupComplete?: boolean;
  setupComplete?: boolean;
}

export function resolveOnboardingPhase(input: ResolveOnboardingPhaseInput): OnboardingPhase {
  if (input.requiresPoolCatalog === true && input.hasPoolCatalog !== true) {
    return 'collect-pool-catalog';
  }

  if (!input.hasSetupInput) {
    return 'collect-setup-input';
  }

  if (!input.hasFundingTokenInput) {
    return 'collect-funding-token';
  }

  if (input.requiresDelegationSigning && !input.hasDelegationBundle) {
    return 'collect-delegations';
  }

  if (!input.hasOperatorConfig) {
    return 'prepare-operator';
  }

  if (input.requiresSetupComplete === true && input.setupComplete !== true) {
    return 'prepare-operator';
  }

  return 'ready';
}
