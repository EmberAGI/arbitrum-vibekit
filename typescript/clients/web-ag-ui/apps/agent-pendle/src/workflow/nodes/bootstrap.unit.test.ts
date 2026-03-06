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

  it('does not emit regressive lifecycle or task clears for already-hired threads', async () => {
    const state = {
      private: {
        bootstrapped: false,
      },
      thread: {
        lifecycle: { phase: 'onboarding' },
        task: {
          id: 'task-1',
          taskStatus: { state: 'submitted' },
        },
      },
    } as unknown as ClmmState;

    const result = await bootstrapNode(state, {
      configurable: { thread_id: 'thread-1' },
    } as never);

    const threadUpdate = (result as { thread?: Record<string, unknown> }).thread ?? {};
    expect(threadUpdate['lifecycle']).toBeUndefined();
    expect(Object.hasOwn(threadUpdate, 'task')).toBe(false);
  });
});
