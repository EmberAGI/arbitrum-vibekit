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
  const hasOperatorConfig = Boolean(state.thread.operatorConfig);
  const hasFundingTokenRequirementSatisfied =
    Boolean(state.thread.fundingTokenInput) || hasOperatorConfig;

  const phase = resolveOnboardingPhase({
    requiresPoolCatalog: true,
    hasPoolCatalog: Boolean(state.thread.poolArtifact),
    hasSetupInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: hasFundingTokenRequirementSatisfied,
    requiresDelegationSigning: state.thread.delegationsBypassActive !== true,
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
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
