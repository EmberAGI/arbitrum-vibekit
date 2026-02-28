import { logWarn, type ClmmState, type ClmmUpdate } from '../context.js';

export function syncStateNode(state: ClmmState): ClmmState | ClmmUpdate {
  logWarn('syncState: returning current state snapshot', {
    lifecyclePhase: state.thread.lifecycle?.phase ?? 'prehire',
    taskState: state.thread.task?.taskStatus?.state,
    taskMessage: state.thread.task?.taskStatus?.message?.content,
    onboardingStatus: state.thread.onboardingFlow?.status,
    onboardingStep: state.thread.onboarding?.step,
    onboardingKey: state.thread.onboarding?.key,
    hasOperatorConfig: Boolean(state.thread.operatorConfig),
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
  });
  return state;
}
