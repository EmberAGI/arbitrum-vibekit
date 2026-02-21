import type { TaskState } from '../types/agent';
import { deriveTaskStateForUi } from './deriveTaskStateForUi';

export function resolveSidebarTaskState(params: {
  listTaskState?: TaskState;
  runtimeTaskState?: TaskState;
  runtimeCommand?: string | null;
  runtimeTaskMessage?: string | null;
  fallbackToListWhenRuntimeMissing?: boolean;
}): TaskState | undefined {
  const runtimeTaskState = deriveTaskStateForUi({
    command: params.runtimeCommand,
    taskState: params.runtimeTaskState ?? null,
    taskMessage: params.runtimeTaskMessage ?? null,
  }) as TaskState | null | undefined;

  if (runtimeTaskState != null) {
    return runtimeTaskState;
  }

  if (params.fallbackToListWhenRuntimeMissing === false) {
    return undefined;
  }

  return params.listTaskState;
}
