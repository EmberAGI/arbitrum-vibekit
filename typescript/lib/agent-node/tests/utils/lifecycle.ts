// Lightweight test-only lifecycle helpers to reduce flakiness across suites

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type MaybeStatusUpdate = {
  status?: {
    message?: { referenceTaskIds?: unknown } | null;
    state?: string;
  };
};

export async function waitForReferenceTaskId(
  getParentStatusUpdates: () => readonly MaybeStatusUpdate[],
  timeoutMs: number = 1000,
  pollMs: number = 50,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const updates = getParentStatusUpdates();
    for (const u of updates) {
      const msg = u?.status?.message as { referenceTaskIds?: unknown } | undefined;
      const ref = msg?.referenceTaskIds;
      if (Array.isArray(ref) && typeof ref[0] === 'string' && ref[0]) {
        return ref[0];
      }
    }
    await sleep(pollMs);
  }
  throw new Error('Timed out waiting for referenceTaskIds on parent status updates');
}

export function filterArtifactUpdates<T extends { kind?: string }>(events: readonly T[]): T[] {
  return events.filter((e) => (e as { kind?: string } | undefined)?.kind === 'artifact-update');
}

export async function pollUntilContextHasTask(
  contextManager: { getContext: (id: string) => { state?: { tasks?: string[] } } | null },
  contextId: string,
  taskId: string,
  timeoutMs: number = 2000,
  pollMs: number = 50,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const c = contextManager.getContext(contextId);
    const tasks = c?.state?.tasks ?? [];
    if (Array.isArray(tasks) && tasks.includes(taskId)) return;
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for context ${contextId} to include task ${taskId}`);
}

export async function backfillTaskStateIfNeeded<T>(fetcher: () => Promise<T>): Promise<T> {
  // Single call to the provided fetcher (e.g., client.getTask) to backfill current state
  return fetcher();
}

/**
 * Wait for a workflow task to reach one of the expected states by polling status updates
 * This is behavior-focused - checks observable events instead of internal runtime state
 */
export async function waitForWorkflowState(
  getStatusUpdates: () => readonly MaybeStatusUpdate[],
  taskId: string,
  expectedStates: readonly string[],
  timeoutMs: number = 2000,
  pollMs: number = 50,
): Promise<MaybeStatusUpdate> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const updates = getStatusUpdates();
    for (const update of updates) {
      if (update.status?.state && expectedStates.includes(update.status.state)) {
        return update;
      }
    }
    await sleep(pollMs);
  }
  throw new Error(
    `Timed out waiting for task ${taskId} to reach one of states: ${expectedStates.join(', ')}`,
  );
}
