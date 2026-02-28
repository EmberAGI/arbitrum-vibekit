import { afterEach, describe, expect, it } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectDelegationsNode } from './collectDelegations.js';

const previousDelegationsBypass = process.env['DELEGATIONS_BYPASS'];

describe('collectDelegationsNode', () => {
  afterEach(() => {
    if (previousDelegationsBypass === undefined) {
      delete process.env['DELEGATIONS_BYPASS'];
      return;
    }
    process.env['DELEGATIONS_BYPASS'] = previousDelegationsBypass;
  });

  it('preserves reduced onboarding totals when delegation step is skipped', async () => {
    process.env['DELEGATIONS_BYPASS'] = 'true';

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
        onboarding: undefined,
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
    expect((view as { onboarding?: unknown }).onboarding).toBeUndefined();
  });
});
