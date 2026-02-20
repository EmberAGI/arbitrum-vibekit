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
  const hasOperatorConfig = Boolean(state.view.operatorConfig);
  const hasFundingTokenRequirementSatisfied =
    Boolean(state.view.fundingTokenInput) || hasOperatorConfig;

  const phase = resolveOnboardingPhase({
    requiresPoolCatalog: true,
    hasPoolCatalog: Boolean(state.view.poolArtifact),
    hasSetupInput: Boolean(state.view.operatorInput),
    hasFundingTokenInput: hasFundingTokenRequirementSatisfied,
    requiresDelegationSigning: state.view.delegationsBypassActive !== true,
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    hasOperatorConfig,
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
