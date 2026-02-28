export function deriveTaskStateForUi(params: {
  lifecyclePhase: string | null | undefined;
  taskState: string | null | undefined;
  taskMessage: string | null | undefined;
}): string | null | undefined {
  const { lifecyclePhase, taskState, taskMessage } = params;

  if (lifecyclePhase !== 'firing') {
    return taskState;
  }
  if (taskState !== 'failed') {
    return taskState;
  }

  const normalized = `${taskMessage ?? ''}`.toLowerCase();
  const isInterruptLike =
    normalized.includes('interrupt') ||
    normalized.includes('aborted') ||
    normalized.includes('aborterror');

  return isInterruptLike ? 'completed' : taskState;
}
