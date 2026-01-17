import type { RunnableConfig } from '@langchain/core/runnables';
import type { MemorySaver } from '@langchain/langgraph';

export type CheckpointConfig = RunnableConfig<Record<string, unknown>> & {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};

type ThreadStorage = MemorySaver['storage'][string];

type ParsedOuterKey = [string, string | null, string];

function parseOuterKey(key: string): ParsedOuterKey | null {
  try {
    const parsed = JSON.parse(key) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    const values: unknown[] = parsed;
    if (values.length < 3) {
      return null;
    }

    const threadId = values[0];
    const checkpointNamespace = values[1];
    const checkpointId = values[2];
    if (typeof threadId !== 'string' || typeof checkpointId !== 'string') {
      return null;
    }

    if (typeof checkpointNamespace === 'string' || checkpointNamespace === null) {
      return [threadId, checkpointNamespace, checkpointId];
    }

    return [threadId, null, checkpointId];
  } catch {
    return null;
  }
}

function pruneThreadStorage(params: {
  threadStorage: ThreadStorage;
  checkpointId: string;
  checkpointNamespace: string | undefined;
}): void {
  const { threadStorage, checkpointId, checkpointNamespace } = params;
  for (const [namespace, checkpoints] of Object.entries(threadStorage)) {
    for (const id of Object.keys(checkpoints)) {
      const matchesNamespace = checkpointNamespace ? namespace === checkpointNamespace : true;
      if (!(matchesNamespace && id === checkpointId)) {
        delete checkpoints[id];
      }
    }
    if (Object.keys(checkpoints).length === 0) {
      delete threadStorage[namespace];
    }
  }
}

export function pruneCheckpointerState(params: {
  storage: MemorySaver['storage'];
  writes: MemorySaver['writes'];
  config: CheckpointConfig;
}): void {
  const { storage, writes, config } = params;
  const configurable = config.configurable;
  const threadId = configurable?.thread_id;
  const checkpointId = configurable?.checkpoint_id;
  const checkpointNamespace = configurable?.checkpoint_ns;
  if (!threadId || !checkpointId) {
    return;
  }

  const threadStorage = storage[threadId];
  if (threadStorage) {
    pruneThreadStorage({
      threadStorage,
      checkpointId,
      checkpointNamespace,
    });
    if (Object.keys(threadStorage).length === 0) {
      delete storage[threadId];
    }
  }

  const normalizedNamespace = checkpointNamespace ?? null;
  const currentOuterKey = JSON.stringify([threadId, checkpointNamespace, checkpointId]);
  for (const key of Object.keys(writes)) {
    if (key === currentOuterKey) {
      continue;
    }

    const parsedKey = parseOuterKey(key);
    if (!parsedKey) {
      continue;
    }

    const [keyThreadId, keyNamespace, keyCheckpointId] = parsedKey;
    const matchesNamespace = keyNamespace === normalizedNamespace;
    if (keyThreadId === threadId && matchesNamespace && keyCheckpointId !== checkpointId) {
      delete writes[key];
    }
  }
}
