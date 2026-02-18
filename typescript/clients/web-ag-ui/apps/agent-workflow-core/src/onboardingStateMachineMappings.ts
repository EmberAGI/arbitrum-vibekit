import type { OnboardingPhase } from './onboardingStateMachine.js';

export function mapOnboardingPhaseToTarget<TTarget extends string>(params: {
  phase: OnboardingPhase;
  targets: {
    collectPoolCatalog?: TTarget;
    collectSetupInput: TTarget;
    collectFundingToken: TTarget;
    collectDelegations: TTarget;
    prepareOperator: TTarget;
    ready: TTarget;
  };
}): TTarget {
  switch (params.phase) {
    case 'collect-pool-catalog':
      if (!params.targets.collectPoolCatalog) {
        return params.targets.collectSetupInput;
      }
      return params.targets.collectPoolCatalog;
    case 'collect-setup-input':
      return params.targets.collectSetupInput;
    case 'collect-funding-token':
      return params.targets.collectFundingToken;
    case 'collect-delegations':
      return params.targets.collectDelegations;
    case 'prepare-operator':
      return params.targets.prepareOperator;
    case 'ready':
      return params.targets.ready;
    default: {
      const neverPhase: never = params.phase;
      return neverPhase;
    }
  }
}
