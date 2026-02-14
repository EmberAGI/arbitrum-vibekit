export function deriveTaskStateForUi(params: {
  command: string | null | undefined;
  taskState: string | null | undefined;
  taskMessage: string | null | undefined;
}): string | null | undefined {
  const { command, taskState, taskMessage } = params;

  if (command !== 'fire') {
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

