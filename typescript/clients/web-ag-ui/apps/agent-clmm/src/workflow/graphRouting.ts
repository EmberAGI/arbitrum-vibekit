import type { ClmmState } from './context.js';
import { extractCommand } from './nodes/runCommand.js';
import { resolveNextOnboardingNode } from './onboardingRouting.js';

export function resolvePostBootstrap(
  state: ClmmState,
):
  | 'listPools'
  | 'collectOperatorInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'syncState' {
  const command = extractCommand(state.private.activeCommand);
  if (command === 'sync') {
    return 'syncState';
  }
  return resolveNextOnboardingNode(state);
}

export function resolvePostRunCycle(
  state: ClmmState,
):
  | 'listPools'
  | 'collectOperatorInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'pollCycle' {
  const nextOnboardingNode = resolveNextOnboardingNode(state);
  return nextOnboardingNode === 'syncState' ? 'pollCycle' : nextOnboardingNode;
}

export function resolvePostFundingTokenInput(
  state: ClmmState,
):
  | 'listPools'
  | 'collectOperatorInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator' {
  const nextOnboardingNode = resolveNextOnboardingNode(state);
  return nextOnboardingNode === 'syncState' ? 'prepareOperator' : nextOnboardingNode;
}

export function resolvePostCollectDelegations(
  state: ClmmState,
):
  | 'listPools'
  | 'collectOperatorInput'
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
  | 'listPools'
  | 'collectOperatorInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'pollCycle'
  | 'summarize' {
  if (state.thread.haltReason) {
    return 'summarize';
  }

  if (state.thread.operatorConfig && state.thread.selectedPool) {
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
  | 'listPools'
  | 'collectOperatorInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
  | 'summarize' {
  if (!state.thread.operatorConfig || !state.thread.selectedPool) {
    const nextOnboardingNode = resolveNextOnboardingNode(state);
    return nextOnboardingNode === 'syncState' ? 'summarize' : nextOnboardingNode;
  }
  return 'summarize';
}
