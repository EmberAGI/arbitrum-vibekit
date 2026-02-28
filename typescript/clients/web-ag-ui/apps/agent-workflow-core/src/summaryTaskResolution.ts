import type { TaskState } from './taskLifecycle.js';

export interface ResolveSummaryTaskStatusInput {
  haltReason?: string | null;
  currentTaskState?: TaskState | string | null;
  currentTaskMessage?: string | null;
  staleDelegationWaitCleared?: boolean;
  onboardingComplete?: boolean;
  activeSummaryMessage: string;
  onboardingCompleteMessage: string;
}

export interface ResolvedSummaryTaskStatus {
  state: TaskState;
  message: string;
}

function isLikelyStaleOnboardingWaitMessage(message: string | null | undefined): boolean {
  const normalized = `${message ?? ''}`.toLowerCase();
  if (normalized.length === 0) {
    return false;
  }

  return (
    normalized.includes('continue setup') ||
    normalized.includes('continue onboarding') ||
    normalized.includes('required permissions') ||
    normalized.includes('delegation approval') ||
    normalized.includes('onboarding input') ||
    normalized.includes('onboarding prerequisite')
  );
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
    input.onboardingComplete === true &&
    input.currentTaskState === 'input-required' &&
    isLikelyStaleOnboardingWaitMessage(input.currentTaskMessage)
  ) {
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
