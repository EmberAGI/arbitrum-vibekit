import type { TaskState } from './taskLifecycle.js';

export interface ResolveSummaryTaskStatusInput {
  haltReason?: string | null;
  currentTaskState?: TaskState | string | null;
  currentTaskMessage?: string | null;
  staleDelegationWaitCleared?: boolean;
  activeSummaryMessage: string;
  onboardingCompleteMessage: string;
}

export interface ResolvedSummaryTaskStatus {
  state: TaskState;
  message: string;
}

export function resolveSummaryTaskStatus(
  input: ResolveSummaryTaskStatusInput,
): ResolvedSummaryTaskStatus {
  if (input.haltReason) {
    return {
      state: 'failed',
      message: input.haltReason,
    };
  }

  if (input.staleDelegationWaitCleared) {
    return {
      state: 'working',
      message: input.onboardingCompleteMessage,
    };
  }

  if (
    input.currentTaskState &&
    input.currentTaskState !== 'working' &&
    input.currentTaskState !== 'submitted'
  ) {
    return {
      state: input.currentTaskState as TaskState,
      message: input.currentTaskMessage ?? input.activeSummaryMessage,
    };
  }

  return {
    state: 'working',
    message: input.activeSummaryMessage,
  };
}
