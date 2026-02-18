import type { ClmmState } from './context.js';

export type OnboardingNodeTarget =
  | 'collectSetupInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'syncState';

export function resolveNextOnboardingNode(state: ClmmState): OnboardingNodeTarget {
  if (!state.view.operatorInput) {
    return 'collectSetupInput';
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
