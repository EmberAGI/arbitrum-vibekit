import { describe, expect, it } from 'vitest';

import { mapOnboardingPhaseToTarget } from './onboardingStateMachineMappings';

describe('mapOnboardingPhaseToTarget', () => {
  const targets = {
    collectPoolCatalog: 'listPools',
    collectSetupInput: 'collectSetupInput',
    collectFundingToken: 'collectFundingTokenInput',
    collectDelegations: 'collectDelegations',
    prepareOperator: 'prepareOperator',
    ready: 'syncState',
  } as const;

  it('maps each onboarding phase to a concrete node target', () => {
    expect(mapOnboardingPhaseToTarget({ phase: 'collect-pool-catalog', targets })).toBe('listPools');
    expect(mapOnboardingPhaseToTarget({ phase: 'collect-setup-input', targets })).toBe('collectSetupInput');
    expect(mapOnboardingPhaseToTarget({ phase: 'collect-funding-token', targets })).toBe(
      'collectFundingTokenInput',
    );
    expect(mapOnboardingPhaseToTarget({ phase: 'collect-delegations', targets })).toBe(
      'collectDelegations',
    );
    expect(mapOnboardingPhaseToTarget({ phase: 'prepare-operator', targets })).toBe('prepareOperator');
    expect(mapOnboardingPhaseToTarget({ phase: 'ready', targets })).toBe('syncState');
  });

  it('falls back to setup target when pool-catalog phase is used without list target', () => {
    expect(
      mapOnboardingPhaseToTarget({
        phase: 'collect-pool-catalog',
        targets: {
          collectSetupInput: 'collectSetupInput',
          collectFundingToken: 'collectFundingTokenInput',
          collectDelegations: 'collectDelegations',
          prepareOperator: 'prepareOperator',
          ready: 'syncState',
        },
      }),
    ).toBe('collectSetupInput');
  });
});
