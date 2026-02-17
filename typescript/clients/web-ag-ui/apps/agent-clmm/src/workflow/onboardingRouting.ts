import type { ClmmState } from './context.js';

export type OnboardingNodeTarget =
  | 'listPools'
  | 'collectOperatorInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'syncState';

export function resolveNextOnboardingNode(state: ClmmState): OnboardingNodeTarget {
  if (!state.view.poolArtifact) {
    return 'listPools';
  }
  if (!state.view.operatorInput) {
    return 'collectOperatorInput';
  }
  if (!state.view.fundingTokenInput) {
    return 'collectFundingTokenInput';
  }
  if (state.view.delegationsBypassActive !== true && !state.view.delegationBundle) {
    return 'collectDelegations';
  }
  if (!state.view.operatorConfig) {
    return 'prepareOperator';
  }
  return 'syncState';
}
