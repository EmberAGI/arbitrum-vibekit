import type { OnboardingStatus, TaskState, ThreadLifecyclePhase } from '../types/agent';
import { deriveTaskStateForUi } from './deriveTaskStateForUi';

function shouldSuppressPrehireTaskState(params: {
  lifecyclePhase?: ThreadLifecyclePhase | null;
  onboardingStatus?: OnboardingStatus;
  taskState?: TaskState;
}): boolean {
  if (params.lifecyclePhase !== 'prehire' || params.onboardingStatus === 'in_progress') {
    return false;
  }

  return (
    params.taskState === 'working' ||
    params.taskState === 'submitted' ||
    params.taskState === 'input-required' ||
    params.taskState == null
  );
}

export function resolveSidebarTaskState(params: {
  listTaskState?: TaskState;
  listLifecyclePhase?: ThreadLifecyclePhase | null;
  listOnboardingStatus?: OnboardingStatus;
  runtimeTaskState?: TaskState;
  runtimeLifecyclePhase?: string | null;
  runtimeOnboardingStatus?: OnboardingStatus;
  runtimeTaskMessage?: string | null;
  fallbackToListWhenRuntimeMissing?: boolean;
}): TaskState | undefined {
  const runtimeTaskState = deriveTaskStateForUi({
    lifecyclePhase: params.runtimeLifecyclePhase,
    taskState: params.runtimeTaskState ?? null,
    taskMessage: params.runtimeTaskMessage ?? null,
  }) as TaskState | null | undefined;

  if (
    runtimeTaskState != null &&
    !shouldSuppressPrehireTaskState({
      lifecyclePhase: params.runtimeLifecyclePhase as ThreadLifecyclePhase | null | undefined,
      onboardingStatus: params.runtimeOnboardingStatus,
      taskState: runtimeTaskState,
    })
  ) {
    return runtimeTaskState;
  }

  if (params.fallbackToListWhenRuntimeMissing === false) {
    return undefined;
  }

  if (
    shouldSuppressPrehireTaskState({
      lifecyclePhase: params.listLifecyclePhase,
      onboardingStatus: params.listOnboardingStatus,
      taskState: params.listTaskState,
    })
  ) {
    return undefined;
  }

  return params.listTaskState;
}
