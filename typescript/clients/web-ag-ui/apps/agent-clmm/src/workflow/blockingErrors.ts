export function buildClearedBlockingErrorState(): {
  haltReason: string;
  executionError: string;
} {
  return {
    haltReason: '',
    executionError: '',
  };
}
