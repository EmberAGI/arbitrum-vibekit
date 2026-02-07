import { describe, expect, it } from 'vitest';

import { ShallowMemorySaver } from './shallowMemorySaver.js';

describe('ShallowMemorySaver', () => {
  it('prunes storage and writes for a given checkpoint', () => {
    const saver = new ShallowMemorySaver();

    (saver as unknown as { storage: Record<string, Record<string, Record<string, unknown>>> }).storage =
      {
        thread1: {
          ns1: { keep: { value: 1 }, drop: { value: 2 } },
          ns2: { other: { value: 3 } },
        },
      };

    (saver as unknown as { writes: Record<string, unknown> }).writes = {
      [JSON.stringify(['thread1', 'ns1', 'keep'])]: { value: 'keep' },
      [JSON.stringify(['thread1', 'ns1', 'drop'])]: { value: 'drop' },
      [JSON.stringify(['thread1', 'ns2', 'other'])]: { value: 'other' },
    };

    const config = {
      configurable: {
        thread_id: 'thread1',
        checkpoint_id: 'keep',
        checkpoint_ns: 'ns1',
      },
    };

    (saver as unknown as { pruneHistory: (cfg: unknown) => void }).pruneHistory(config);

    const storage = (saver as unknown as { storage: Record<string, Record<string, Record<string, unknown>>> })
      .storage;
    expect(storage['thread1']).toEqual({ ns1: { keep: { value: 1 } } });

    const writes = (saver as unknown as { writes: Record<string, unknown> }).writes;
    expect(Object.keys(writes).sort()).toEqual(
      [JSON.stringify(['thread1', 'ns1', 'keep']), JSON.stringify(['thread1', 'ns2', 'other'])].sort(),
    );
  });

  it('handles invalid write keys safely', () => {
    const saver = new ShallowMemorySaver();
    (saver as unknown as { writes: Record<string, unknown> }).writes = {
      'not-json': { value: 'bad' },
      [JSON.stringify(['thread2', null, 'keep'])]: { value: 'keep' },
    };

    const config = {
      configurable: {
        thread_id: 'thread2',
        checkpoint_id: 'keep',
        checkpoint_ns: undefined,
      },
    };

    (saver as unknown as { pruneHistory: (cfg: unknown) => void }).pruneHistory(config);

    const writes = (saver as unknown as { writes: Record<string, unknown> }).writes;
    expect(Object.keys(writes)).toContain('not-json');
    expect(Object.keys(writes)).toContain(JSON.stringify(['thread2', null, 'keep']));
  });
});
