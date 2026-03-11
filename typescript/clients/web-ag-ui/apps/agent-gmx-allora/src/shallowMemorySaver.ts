import type { RunnableConfig } from '@langchain/core/runnables';
import { MemorySaver } from '@langchain/langgraph';
import { pruneCheckpointerState } from 'agent-workflow-core';

type CheckpointConfig = RunnableConfig<Record<string, unknown>> & {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};

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
    pruneCheckpointerState({
      storage: this.storage,
      writes: this.writes,
      config,
    });
  }
}
