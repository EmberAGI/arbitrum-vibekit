import { describe, expect, it } from 'vitest';

import { resolveBlockersInterruptView } from './agentBlockersInterrupt';

describe('agentBlockersInterrupt', () => {
  it('maps setup interrupts to step 1', () => {
    expect(resolveBlockersInterruptView({ interruptType: 'operator-config-request', maxSetupStep: 4 })).toEqual({
      kind: 'operator-config',
      interruptStep: 1,
    });
    expect(resolveBlockersInterruptView({ interruptType: 'pendle-setup-request', maxSetupStep: 4 })).toEqual({
      kind: 'pendle-setup',
      interruptStep: 1,
    });
    expect(resolveBlockersInterruptView({ interruptType: 'gmx-setup-request', maxSetupStep: 4 })).toEqual({
      kind: 'gmx-setup',
      interruptStep: 1,
    });
  });

  it('maps funding-related interrupts to the expected steps', () => {
    expect(resolveBlockersInterruptView({ interruptType: 'pendle-fund-wallet-request', maxSetupStep: 4 })).toEqual({
      kind: 'pendle-fund-wallet',
      interruptStep: 2,
    });
    expect(resolveBlockersInterruptView({ interruptType: 'clmm-funding-token-request', maxSetupStep: 4 })).toEqual({
      kind: 'funding-token',
      interruptStep: 2,
    });
    expect(resolveBlockersInterruptView({ interruptType: 'gmx-funding-token-request', maxSetupStep: 4 })).toEqual({
      kind: 'funding-token',
      interruptStep: 2,
    });
    expect(resolveBlockersInterruptView({ interruptType: 'gmx-fund-wallet-request', maxSetupStep: 4 })).toEqual({
      kind: 'gmx-fund-wallet',
      interruptStep: 4,
    });
  });

  it('maps delegation-signing interrupts to step 3', () => {
    expect(
      resolveBlockersInterruptView({
        interruptType: 'clmm-delegation-signing-request',
        maxSetupStep: 4,
      }),
    ).toEqual({
      kind: 'delegation-signing',
      interruptStep: 3,
    });
  });

  it('returns none when no known interrupt is active', () => {
    expect(resolveBlockersInterruptView({ interruptType: null, maxSetupStep: 4 })).toEqual({
      kind: 'none',
      interruptStep: null,
    });
    expect(resolveBlockersInterruptView({ interruptType: 'unknown-type', maxSetupStep: 4 })).toEqual({
      kind: 'none',
      interruptStep: null,
    });
  });
});
