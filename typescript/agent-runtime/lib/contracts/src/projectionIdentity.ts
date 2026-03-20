export type CanonicalPiIdentity = {
  threadId: string;
  executionId: string;
  automationId?: string;
  automationRunId?: string;
};

export type AgUiProjectionIdentity = {
  threadId: string;
  taskId: string;
};

export type A2AProjectionIdentity = {
  contextId: string;
  taskId: string;
};

export type ChannelProjectionIdentity = {
  threadId: string;
  executionId: string;
  automationId?: string;
  automationRunId?: string;
};

export type ProjectionIdentitySnapshot = {
  canonical: CanonicalPiIdentity;
  agUi: AgUiProjectionIdentity;
  a2a: A2AProjectionIdentity;
  channel: ChannelProjectionIdentity;
};

export type ProjectionIdentityTransitionMode = 'replay' | 'restart';

function requireNonEmptyId(value: string, field: keyof CanonicalPiIdentity): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Projection identity requires a non-empty '${field}'.`);
  }
  return normalized;
}

function normalizeOptionalId(
  value: string | undefined,
  field: 'automationId' | 'automationRunId',
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireNonEmptyId(value, field);
}

function assertDistinctCanonicalIds(input: CanonicalPiIdentity): void {
  const orderedEntries = [
    ['threadId', input.threadId],
    ['executionId', input.executionId],
    ['automationId', input.automationId],
    ['automationRunId', input.automationRunId],
  ] as const;

  for (let leftIndex = 0; leftIndex < orderedEntries.length; leftIndex += 1) {
    const [leftField, leftValue] = orderedEntries[leftIndex];
    if (!leftValue) {
      continue;
    }

    for (let rightIndex = leftIndex + 1; rightIndex < orderedEntries.length; rightIndex += 1) {
      const [rightField, rightValue] = orderedEntries[rightIndex];
      if (!rightValue) {
        continue;
      }

      if (leftValue === rightValue) {
        throw new Error(
          `Projection identity requires distinct canonical ids for '${leftField}' and '${rightField}'.`,
        );
      }
    }
  }
}

export function buildProjectionIdentitySnapshot(input: CanonicalPiIdentity): ProjectionIdentitySnapshot {
  const threadId = requireNonEmptyId(input.threadId, 'threadId');
  const executionId = requireNonEmptyId(input.executionId, 'executionId');
  const automationId = normalizeOptionalId(input.automationId, 'automationId');
  const automationRunId = normalizeOptionalId(input.automationRunId, 'automationRunId');
  if (automationRunId && !automationId) {
    throw new Error("Projection identity requires 'automationId' when 'automationRunId' is present.");
  }

  const canonical: CanonicalPiIdentity = {
    threadId,
    executionId,
    ...(automationId ? { automationId } : {}),
    ...(automationRunId ? { automationRunId } : {}),
  };
  assertDistinctCanonicalIds(canonical);

  return {
    canonical,
    agUi: {
      threadId,
      taskId: executionId,
    },
    a2a: {
      contextId: threadId,
      taskId: executionId,
    },
    channel: {
      threadId,
      executionId,
      ...(automationId ? { automationId } : {}),
      ...(automationRunId ? { automationRunId } : {}),
    },
  };
}

export function assertProjectionIdentityTransition(input: {
  previous: ProjectionIdentitySnapshot;
  next: ProjectionIdentitySnapshot;
  mode: ProjectionIdentityTransitionMode;
}): void {
  if (input.mode === 'replay') {
    if (input.previous.canonical.threadId !== input.next.canonical.threadId) {
      throw new Error("Replay must preserve the canonical 'threadId' across projections.");
    }

    if (input.previous.canonical.executionId !== input.next.canonical.executionId) {
      throw new Error("Replay must preserve the canonical 'executionId' across projections.");
    }

    return;
  }

  if (input.previous.canonical.threadId !== input.next.canonical.threadId) {
    throw new Error("Restart must preserve the canonical 'threadId' across projections.");
  }
}
