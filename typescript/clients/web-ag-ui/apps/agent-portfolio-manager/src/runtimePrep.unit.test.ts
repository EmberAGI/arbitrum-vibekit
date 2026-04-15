import { describe, expect, it, vi } from 'vitest';

import { resolveManagedSharedEmberBootstrap } from '../../../scripts/smoke/support/runtimePrep.js';

describe('resolveManagedSharedEmberBootstrap', () => {
  it('awaits the async reference bootstrap before layering managed harness overrides', async () => {
    const walletObservationSource = {
      observeWallet: vi.fn(),
    };
    const resolveReferenceBootstrap = vi.fn().mockResolvedValue({
      walletObservationSource,
      managedOnboardingIssuers: {
        existing: { issueDelegation: vi.fn() },
      },
      subagentRuntimes: {
        existing: { execute: vi.fn() },
      },
    });
    const managedOnboardingIssuers = {
      'ember-lending': { issueDelegation: vi.fn() },
    };
    const subagentRuntimes = {
      'ember-lending': { execute: vi.fn() },
    };

    const bootstrap = await resolveManagedSharedEmberBootstrap(
      {
        specRoot: '/tmp/spec-root',
        vibekitRoot: '/tmp/vibekit-root',
        managedAgentId: 'ember-lending',
      },
      {
        resolveReferenceBootstrap,
        createManagedOnboardingIssuers: vi.fn().mockResolvedValue(managedOnboardingIssuers),
        createSubagentRuntimes: vi.fn().mockResolvedValue(subagentRuntimes),
      },
    );

    expect(resolveReferenceBootstrap).toHaveBeenCalledTimes(1);
    expect(bootstrap.walletObservationSource).toBe(walletObservationSource);
    expect(bootstrap.managedOnboardingIssuers).toMatchObject({
      existing: expect.any(Object),
      'ember-lending': managedOnboardingIssuers['ember-lending'],
    });
    expect(bootstrap.subagentRuntimes).toMatchObject({
      existing: expect.any(Object),
      'ember-lending': subagentRuntimes['ember-lending'],
    });
  });
});
