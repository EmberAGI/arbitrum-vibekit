import type { MemorySaver } from '@langchain/langgraph';

import { loadLangGraphApiCheckpointer } from './langgraphCheckpointerRetention.js';

type CheckpointTuple = [string | Uint8Array, string | Uint8Array, string];
type ThreadStorage = MemorySaver['storage'][string];

const DEFAULT_POLL_INTERVAL_MS = 5_000;

export type PersistedCronRecoveryCandidate = {
  threadId: string;
  pollIntervalMs: number;
};

export type ScheduleThread = (threadId: string, intervalMs?: number) => unknown;

let persistedCronRestorationPromise: Promise<PersistedCronRecoveryCandidate[]> | undefined;

type PersistedChannelValues = {
  private?: {
    bootstrapped?: boolean;
    pollIntervalMs?: number;
    cronScheduled?: boolean;
  };
  thread?: {
    lifecycle?: {
      phase?: string;
    };
    operatorConfig?: unknown;
    selectedPool?: unknown;
  };
};

function decodeCheckpointTuple(value: unknown): {
  ts?: string;
  channelValues?: PersistedChannelValues;
} | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const [serializedCheckpoint] = value as CheckpointTuple;
  if (!(typeof serializedCheckpoint === 'string' || serializedCheckpoint instanceof Uint8Array)) {
    return null;
  }

  try {
    const serializedBuffer =
      typeof serializedCheckpoint === 'string'
        ? Buffer.from(serializedCheckpoint, 'base64')
        : Buffer.from(serializedCheckpoint);
    const payload = JSON.parse(serializedBuffer.toString('utf8')) as {
      ts?: string;
      channel_values?: PersistedChannelValues;
    };
    return {
      ts: payload.ts,
      channelValues: payload.channel_values,
    };
  } catch {
    return null;
  }
}

function resolveLatestCheckpoint(threadStorage: ThreadStorage | undefined): PersistedChannelValues | undefined {
  if (!threadStorage) {
    return undefined;
  }

  let latest: { ts?: string; channelValues?: PersistedChannelValues } | null = null;

  for (const checkpoints of Object.values(threadStorage)) {
    if (!checkpoints || typeof checkpoints !== 'object') {
      continue;
    }

    for (const checkpoint of Object.values(checkpoints)) {
      const decoded = decodeCheckpointTuple(checkpoint);
      if (!decoded?.channelValues) {
        continue;
      }

      if (!latest) {
        latest = decoded;
        continue;
      }

      const latestTs = Date.parse(latest.ts ?? '');
      const candidateTs = Date.parse(decoded.ts ?? '');
      if (Number.isNaN(latestTs) || (!Number.isNaN(candidateTs) && candidateTs > latestTs)) {
        latest = decoded;
      }
    }
  }

  return latest?.channelValues;
}

export function resolvePersistedCronRecoveryCandidates(
  storage: MemorySaver['storage'],
): PersistedCronRecoveryCandidate[] {
  const candidates: PersistedCronRecoveryCandidate[] = [];

  for (const [threadId, threadStorage] of Object.entries(storage)) {
    const channelValues = resolveLatestCheckpoint(threadStorage);
    if (!channelValues) {
      continue;
    }

    const isBootstrapped = channelValues.private?.bootstrapped === true;
    const expectedCronScheduled = channelValues.private?.cronScheduled === true;
    const isActive = channelValues.thread?.lifecycle?.phase === 'active';
    const hasOperatorConfig = channelValues.thread?.operatorConfig !== undefined;
    const hasSelectedPool = channelValues.thread?.selectedPool !== undefined;
    if (!(isBootstrapped && expectedCronScheduled && isActive && hasOperatorConfig && hasSelectedPool)) {
      continue;
    }

    candidates.push({
      threadId,
      pollIntervalMs: channelValues.private?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    });
  }

  return candidates;
}

export function restorePersistedCronSchedules(params: {
  storage: MemorySaver['storage'];
  scheduleThread: ScheduleThread;
}): PersistedCronRecoveryCandidate[] {
  const candidates = resolvePersistedCronRecoveryCandidates(params.storage);
  for (const candidate of candidates) {
    params.scheduleThread(candidate.threadId, candidate.pollIntervalMs);
  }
  return candidates;
}

export async function restorePersistedCronSchedulesFromCheckpointer(
  scheduleThread: ScheduleThread,
  loadCheckpointer: () => Promise<MemorySaver> = loadLangGraphApiCheckpointer,
): Promise<PersistedCronRecoveryCandidate[]> {
  if (!persistedCronRestorationPromise) {
    persistedCronRestorationPromise = (async () => {
      const checkpointer = await loadCheckpointer();
      return restorePersistedCronSchedules({
        storage: checkpointer.storage,
        scheduleThread,
      });
    })().catch((error: unknown) => {
      persistedCronRestorationPromise = undefined;
      throw error;
    });
  }

  return persistedCronRestorationPromise;
}
