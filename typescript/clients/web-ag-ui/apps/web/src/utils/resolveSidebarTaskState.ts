import type { TaskState } from '../types/agent';
import { deriveTaskStateForUi } from './deriveTaskStateForUi';

const isBlockedState = (state: TaskState | undefined): boolean =>
  state === 'input-required' || state === 'failed';

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

  if (isBlockedState(params.listTaskState) && !isBlockedState(runtimeTaskState)) {
    return params.listTaskState;
  }

  return runtimeTaskState ?? params.listTaskState;
}
