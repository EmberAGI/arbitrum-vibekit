import type { TaskState } from '../types/agent';
import { deriveTaskStateForUi } from './deriveTaskStateForUi';

export function resolveSidebarTaskState(params: {
  listTaskState?: TaskState;
  runtimeTaskState?: TaskState;
  runtimeCommand?: string | null;
  runtimeTaskMessage?: string | null;
}): TaskState | undefined {
  const runtimeTaskState = deriveTaskStateForUi({
    command: params.runtimeCommand,
    taskState: params.runtimeTaskState ?? null,
    taskMessage: params.runtimeTaskMessage ?? null,
  }) as TaskState | undefined;

  return runtimeTaskState ?? params.listTaskState;
}
