import { mapOnboardingPhaseToTarget, resolveOnboardingPhase } from 'agent-workflow-core';

import type { ClmmState } from './context.js';

export type OnboardingNodeTarget =
  | 'collectSetupInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'syncState';

export function resolveNextOnboardingNode(state: ClmmState): OnboardingNodeTarget {
  const phase = resolveOnboardingPhase({
    hasSetupInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    requiresDelegationSigning: state.thread.delegationsBypassActive !== true,
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
    hasOperatorConfig: Boolean(state.thread.operatorConfig),
  });

  return mapOnboardingPhaseToTarget<OnboardingNodeTarget>({
    phase,
    targets: {
      collectSetupInput: 'collectSetupInput',
      collectFundingToken: 'collectFundingTokenInput',
      collectDelegations: 'collectDelegations',
      prepareOperator: 'prepareOperator',
      ready: 'syncState',
    },
  });
}
