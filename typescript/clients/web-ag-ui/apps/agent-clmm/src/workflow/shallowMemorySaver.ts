import { MemorySaver } from '@langchain/langgraph';

import { pruneCheckpointerState, type CheckpointConfig } from './checkpointerPruner.js';

export class ShallowMemorySaver extends MemorySaver {
  override async put(
    ...args: Parameters<MemorySaver['put']>
  ): ReturnType<MemorySaver['put']> {
    const nextConfig = await super.put(...args);
    pruneCheckpointerState({
      storage: this.storage,
      writes: this.writes,
      config: nextConfig as CheckpointConfig,
    });
    return nextConfig;
  }

  override async putWrites(
    ...args: Parameters<MemorySaver['putWrites']>
  ): ReturnType<MemorySaver['putWrites']> {
    await super.putWrites(...args);
    const [config] = args;
    pruneCheckpointerState({
      storage: this.storage,
      writes: this.writes,
      config: config as CheckpointConfig,
    });
  }
}
