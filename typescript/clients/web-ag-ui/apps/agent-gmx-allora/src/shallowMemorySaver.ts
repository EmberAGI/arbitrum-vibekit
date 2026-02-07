import type { RunnableConfig } from '@langchain/core/runnables';
import { MemorySaver } from '@langchain/langgraph';

type CheckpointConfig = RunnableConfig<Record<string, unknown>> & {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};

type ThreadStorage = MemorySaver['storage'][string];

export class ShallowMemorySaver extends MemorySaver {
  override async put(...args: Parameters<MemorySaver['put']>): ReturnType<MemorySaver['put']> {
    const nextConfig = await super.put(...args);
    this.pruneHistory(nextConfig as CheckpointConfig);
    return nextConfig;
  }

  override async putWrites(
    ...args: Parameters<MemorySaver['putWrites']>
  ): ReturnType<MemorySaver['putWrites']> {
    await super.putWrites(...args);
    const [config] = args;
    this.pruneHistory(config as CheckpointConfig);
  }

  private pruneHistory(config: CheckpointConfig): void {
    const configurable = config.configurable;
    const threadId = configurable?.thread_id;
    const checkpointId = configurable?.checkpoint_id;
    const checkpointNamespace = configurable?.checkpoint_ns;
    if (!threadId || !checkpointId) {
      return;
    }

    const threadStorage = this.storage[threadId];
    if (threadStorage) {
      this.pruneThreadStorage(threadStorage, checkpointId, checkpointNamespace);
      if (Object.keys(threadStorage).length === 0) {
        delete this.storage[threadId];
      }
    }

    const normalizedNamespace = checkpointNamespace ?? null;
    const currentOuterKey = JSON.stringify([threadId, checkpointNamespace, checkpointId]);
    for (const key of Object.keys(this.writes)) {
      if (key === currentOuterKey) {
        continue;
      }

      const parsedKey = this.parseOuterKey(key);
      if (!parsedKey) {
        continue;
      }

      const [keyThreadId, keyNamespace, keyCheckpointId] = parsedKey;
      const matchesNamespace = keyNamespace === normalizedNamespace;
      if (keyThreadId === threadId && matchesNamespace && keyCheckpointId !== checkpointId) {
        delete this.writes[key];
      }
    }
  }

  private parseOuterKey(key: string): [string, string | null, string] | null {
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

  private pruneThreadStorage(
    threadStorage: ThreadStorage,
    checkpointId: string,
    checkpointNamespace: string | undefined,
  ): void {
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
}
