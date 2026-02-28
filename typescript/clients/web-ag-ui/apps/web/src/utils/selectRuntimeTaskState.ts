import { deriveTaskStateForUi } from './deriveTaskStateForUi';

export function selectRuntimeTaskState(input: {
  effectiveTaskState?: string | null;
  lifecyclePhase?: string | null;
  taskState?: string | null;
  taskMessage?: string | null;
}): string | undefined {
  if (input.effectiveTaskState && input.effectiveTaskState.length > 0) {
    return input.effectiveTaskState;
  }

  const derived = deriveTaskStateForUi({
    lifecyclePhase: input.lifecyclePhase,
    taskState: input.taskState,
    taskMessage: input.taskMessage,
  });

  return derived ?? undefined;
}
