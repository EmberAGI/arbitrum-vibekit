import { logWarn, type ClmmState, type ClmmUpdate } from '../context.js';

export function syncStateNode(state: ClmmState): ClmmState | ClmmUpdate {
  logWarn('syncState: returning current state snapshot', {
    command: state.view.command,
    taskState: state.view.task?.taskStatus?.state,
    taskMessage: state.view.task?.taskStatus?.message?.content,
    onboardingStatus: state.view.onboardingFlow?.status,
    onboardingStep: state.view.onboarding?.step,
    onboardingKey: state.view.onboarding?.key,
    hasOperatorConfig: Boolean(state.view.operatorConfig),
    hasDelegationBundle: Boolean(state.view.delegationBundle),
  });
  return state;
}
