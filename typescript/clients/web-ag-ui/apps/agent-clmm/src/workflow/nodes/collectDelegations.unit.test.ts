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
});
