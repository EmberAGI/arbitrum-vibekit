import { mapOnboardingPhaseToTarget, resolveOnboardingPhase } from 'agent-workflow-core';

import type { ClmmState } from './context.js';

export type OnboardingNodeTarget =
  | 'listPools'
  | 'collectOperatorInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'syncState';

export function resolveNextOnboardingNode(state: ClmmState): OnboardingNodeTarget {
  const phase = resolveOnboardingPhase({
    requiresPoolCatalog: true,
    hasPoolCatalog: Boolean(state.view.poolArtifact),
    hasSetupInput: Boolean(state.view.operatorInput),
    hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
    requiresDelegationSigning: state.view.delegationsBypassActive !== true,
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    hasOperatorConfig: Boolean(state.view.operatorConfig),
  });

  return mapOnboardingPhaseToTarget<OnboardingNodeTarget>({
    phase,
    targets: {
      collectPoolCatalog: 'listPools',
      collectSetupInput: 'collectOperatorInput',
      collectFundingToken: 'collectFundingTokenInput',
      collectDelegations: 'collectDelegations',
      prepareOperator: 'prepareOperator',
      ready: 'syncState',
    },
  });
}
