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
      view: {
        delegationsBypassActive: true,
        delegationBundle: undefined,
        onboarding: { step: 2, totalSteps: 2 },
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, {});

    expect('view' in result).toBe(true);
    const onboarding = (result as { view: { onboarding?: { step: number; totalSteps?: number } } }).view
      .onboarding;
    expect(onboarding).toEqual({ step: 2, totalSteps: 2 });
  });

  it('advances task state after delegation bundle is present', async () => {
    const state = {
      view: {
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

    expect('view' in result).toBe(true);
    const view = (result as { view: { task?: { taskStatus?: { state?: string; message?: { content?: string } } } } })
      .view;
    expect(view.task?.taskStatus?.state).toBe('working');
    expect(view.task?.taskStatus?.message?.content).toBe('Delegation approvals received. Continuing onboarding.');
  });
});
