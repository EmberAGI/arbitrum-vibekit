import { mapOnboardingPhaseToTarget, resolveOnboardingPhase } from 'agent-workflow-core';

import type { ClmmState } from './context.js';
import { extractCommand } from './nodes/runCommand.js';

type OnboardingNodeTarget =
  | 'collectSetupInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'syncState';

function resolveNextOnboardingNode(state: ClmmState): OnboardingNodeTarget {
  const phase = resolveOnboardingPhase({
    hasSetupInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    requiresDelegationSigning: state.thread.delegationsBypassActive !== true,
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
    hasOperatorConfig: Boolean(state.thread.operatorConfig),
    requiresSetupComplete: true,
    setupComplete: state.thread.setupComplete === true,
  });

  return mapOnboardingPhaseToTarget<OnboardingNodeTarget>({
    phase,
    targets: {
      collectPoolCatalog: 'collectSetupInput',
      collectSetupInput: 'collectSetupInput',
      collectFundingToken: 'collectFundingTokenInput',
      collectDelegations: 'collectDelegations',
      prepareOperator: 'prepareOperator',
      ready: 'syncState',
    },
  });
}

export function resolvePostBootstrap(state: ClmmState): OnboardingNodeTarget {
  const command = extractCommand(state.private.activeCommand);
  if (command === 'refresh') {
    return 'syncState';
  }
  return resolveNextOnboardingNode(state);
}

export function resolvePostRunCycle(
  state: ClmmState,
): 'collectSetupInput' | 'collectFundingTokenInput' | 'collectDelegations' | 'prepareOperator' | 'pollCycle' {
  const nextOnboardingNode = resolveNextOnboardingNode(state);
  return nextOnboardingNode === 'syncState' ? 'pollCycle' : nextOnboardingNode;
}

export function resolvePostFundingTokenInput(
  state: ClmmState,
): 'collectSetupInput' | 'collectFundingTokenInput' | 'collectDelegations' | 'prepareOperator' {
  const nextOnboardingNode = resolveNextOnboardingNode(state);
  return nextOnboardingNode === 'syncState' ? 'prepareOperator' : nextOnboardingNode;
}

export function resolvePostCollectDelegations(
  state: ClmmState,
):
  | 'collectSetupInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'summarize' {
  if (state.thread.haltReason) {
    return 'summarize';
  }
  const nextOnboardingNode = resolveNextOnboardingNode(state);
  return nextOnboardingNode === 'syncState' ? 'prepareOperator' : nextOnboardingNode;
}

export function resolvePostPrepareOperator(
  state: ClmmState,
):
  | 'collectSetupInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'pollCycle'
  | 'summarize' {
  if (state.thread.haltReason) {
    return 'summarize';
  }

  if (state.thread.operatorConfig && state.thread.setupComplete === true) {
    return 'pollCycle';
  }

  const nextOnboardingNode = resolveNextOnboardingNode(state);
  if (
    nextOnboardingNode !== 'syncState' &&
    nextOnboardingNode !== 'prepareOperator'
  ) {
    return nextOnboardingNode;
  }

  return 'summarize';
}

export function resolvePostPollCycle(
  state: ClmmState,
):
  | 'collectSetupInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'summarize' {
  if (!state.thread.operatorConfig || state.thread.setupComplete !== true) {
    const nextOnboardingNode = resolveNextOnboardingNode(state);
    return nextOnboardingNode === 'syncState' ? 'summarize' : nextOnboardingNode;
  }

  return 'summarize';
}
