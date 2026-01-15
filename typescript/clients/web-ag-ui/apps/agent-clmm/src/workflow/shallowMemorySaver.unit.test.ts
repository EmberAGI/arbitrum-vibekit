import { emptyCheckpoint, type CheckpointMetadata, type PendingWrite } from '@langchain/langgraph-checkpoint';
import { describe, expect, it } from 'vitest';

import { ShallowMemorySaver } from './shallowMemorySaver.js';

const baseMetadata: CheckpointMetadata = {
  source: 'loop',
  step: 0,
  parents: {},
};

function buildCheckpoint(id: string) {
  return {
    ...emptyCheckpoint(),
    id,
  };
}

describe('ShallowMemorySaver', () => {
  it('retains only the latest checkpoint per thread and namespace', async () => {
    // Given a shallow checkpointer and two checkpoints in the same thread
    const saver = new ShallowMemorySaver();
    const threadId = 'thread-1';
    const checkpointNamespace = 'clmm';

    const firstCheckpoint = buildCheckpoint('checkpoint-a');
    const secondCheckpoint = buildCheckpoint('checkpoint-b');

    await saver.put(
      { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace } },
      firstCheckpoint,
      baseMetadata,
    );

    // When a newer checkpoint is stored
    await saver.put(
      { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace } },
      secondCheckpoint,
      baseMetadata,
    );

    // Then only the latest checkpoint remains accessible
    const latest = await saver.getTuple({
      configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace },
    });
    expect(latest?.checkpoint.id).toBe('checkpoint-b');

    const old = await saver.getTuple({
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNamespace,
        checkpoint_id: 'checkpoint-a',
      },
    });
    expect(old).toBeUndefined();
  });

  it('does not evict checkpoints from other threads', async () => {
    // Given checkpoints stored under two different threads
    const saver = new ShallowMemorySaver();
    const checkpointNamespace = 'clmm';

    await saver.put(
      { configurable: { thread_id: 'thread-a', checkpoint_ns: checkpointNamespace } },
      buildCheckpoint('checkpoint-a1'),
      baseMetadata,
    );
    await saver.put(
      { configurable: { thread_id: 'thread-b', checkpoint_ns: checkpointNamespace } },
      buildCheckpoint('checkpoint-b1'),
      baseMetadata,
    );

    // When thread-a writes a newer checkpoint
    await saver.put(
      { configurable: { thread_id: 'thread-a', checkpoint_ns: checkpointNamespace } },
      buildCheckpoint('checkpoint-a2'),
      baseMetadata,
    );

    // Then thread-b checkpoints remain available
    const threadB = await saver.getTuple({
      configurable: {
        thread_id: 'thread-b',
        checkpoint_ns: checkpointNamespace,
        checkpoint_id: 'checkpoint-b1',
      },
    });
    expect(threadB?.checkpoint.id).toBe('checkpoint-b1');
  });

  it('drops pending writes for superseded checkpoints', async () => {
    // Given pending writes for two checkpoints on the same thread
    const saver = new ShallowMemorySaver();
    const threadId = 'thread-writes';
    const checkpointNamespace = 'clmm';

    const firstConfig = await saver.put(
      { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace } },
      buildCheckpoint('checkpoint-1'),
      baseMetadata,
    );

    const firstWrites: PendingWrite[] = [['status', { value: 'first' }]];
    await saver.putWrites(firstConfig, firstWrites, 'task-1');

    const secondConfig = await saver.put(
      { configurable: { thread_id: threadId, checkpoint_ns: checkpointNamespace } },
      buildCheckpoint('checkpoint-2'),
      baseMetadata,
    );

    const secondWrites: PendingWrite[] = [['status', { value: 'second' }]];
    await saver.putWrites(secondConfig, secondWrites, 'task-2');

    // When checking retained writes
    const expectedKey = JSON.stringify([
      threadId,
      checkpointNamespace,
      secondConfig.configurable?.checkpoint_id ?? 'checkpoint-2',
    ]);

    // Then only the latest checkpoint writes are retained
    expect(Object.keys(saver.writes)).toEqual([expectedKey]);
  });
});
