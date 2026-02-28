import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectDelegationsNode } from './collectDelegations.js';

describe('collectDelegationsNode', () => {
  it('uses state-driven/core-helper routing and avoids direct Command construction', async () => {
    const source = await readFile(new URL('./collectDelegations.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('uses shared interrupt payload helpers instead of manual JSON parsing', async () => {
    const source = await readFile(new URL('./collectDelegations.ts', import.meta.url), 'utf8');
    expect(source.includes('requestInterruptPayload(')).toBe(true);
    expect(source.includes('JSON.parse(')).toBe(false);
  });

  it('preserves reduced onboarding totals when delegation step is skipped', async () => {
    const state = {
      thread: {
        delegationsBypassActive: true,
        delegationBundle: undefined,
        onboarding: { step: 2, key: 'funding-token' },
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, {});

    expect('thread' in result).toBe(true);
    const onboarding = (result as { thread: { onboarding?: { step: number; key?: string } } }).thread
      .onboarding;
    expect(onboarding).toEqual({ step: 2, key: 'funding-token' });
  });

  it('advances task state after delegation bundle is present', async () => {
    const state = {
      thread: {
        delegationsBypassActive: false,
        delegationBundle: {
          delegations: [],
        },
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: {
              content: 'Waiting for delegation approval to continue onboarding.',
            },
          },
        },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, {});

    expect('thread' in result).toBe(true);
    const view = (result as { thread: { task?: { taskStatus?: { state?: string; message?: { content?: string } } } } })
      .thread;
    expect(view.task?.taskStatus?.state).toBe('working');
    expect(view.task?.taskStatus?.message?.content).toBe('Delegation approvals received. Continuing onboarding.');
  });

  it('returns state-only update when setup input is missing', async () => {
    const state = {
      thread: {
        delegationsBypassActive: false,
        delegationBundle: undefined,
        operatorInput: undefined,
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, {});
    expect(result).toEqual({});
  });
});
