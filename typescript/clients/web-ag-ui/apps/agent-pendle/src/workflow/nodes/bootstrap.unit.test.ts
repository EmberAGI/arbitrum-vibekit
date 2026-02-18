import { describe, expect, it } from 'vitest';

import type { ClmmState } from '../context.js';

import { bootstrapNode } from './bootstrap.js';

describe('bootstrapNode', () => {
  it('returns a no-op update when the thread is already bootstrapped', async () => {
    const state = {
      private: {
        bootstrapped: true,
      },
    } as unknown as ClmmState;

    const result = await bootstrapNode(state, {
      configurable: { thread_id: 'thread-1' },
    } as never);

    expect(result).toEqual({});
  });
});
