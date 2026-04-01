const IDLE_RUNTIME_CONVERSATION_READY_MESSAGE = 'ready for a live runtime conversation.';

export function deriveTaskStateForUi(params: {
  lifecyclePhase: string | null | undefined;
  taskState: string | null | undefined;
  taskMessage: string | null | undefined;
}): string | null | undefined {
  const { lifecyclePhase, taskState, taskMessage } = params;
  const normalized = `${taskMessage ?? ''}`.trim().toLowerCase();

  if (
    taskState === 'working' &&
    normalized === IDLE_RUNTIME_CONVERSATION_READY_MESSAGE &&
    (lifecyclePhase == null || lifecyclePhase === 'prehire')
  ) {
    return null;
  }

  if (lifecyclePhase !== 'firing') {
    return taskState;
  }
  if (taskState !== 'failed') {
    return taskState;
  }

  const isInterruptLike =
    normalized.includes('interrupt') ||
    normalized.includes('aborted') ||
    normalized.includes('aborterror');

  return isInterruptLike ? 'completed' : taskState;
}
