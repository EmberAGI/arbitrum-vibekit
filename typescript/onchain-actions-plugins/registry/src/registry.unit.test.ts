import { describe, expect, it } from 'vitest';

import type { LifecycleCapability } from './core/index.js';
import { PublicEmberPluginRegistry } from './registry.js';

function createLifecycleCapability(providerId: string): LifecycleCapability {
  return {
    providerId,
    refreshScope: 'full-provider',
    volatileActionTypes: [],
    computeTopologySignature() {
      return Promise.resolve(`${providerId}-signature`);
    },
    getSegmentTopologies() {
      return Promise.resolve([]);
    },
  };
}

describe('PublicEmberPluginRegistry lifecycle capability lookups', () => {
  it('returns the lifecycle capability for a registered provider id', () => {
    const registry = new PublicEmberPluginRegistry();
    const capability = createLifecycleCapability('aave');

    registry.registerLifecycleCapability(capability);

    expect(registry.getLifecycleCapability('aave')).toBe(capability);
  });

  it('returns undefined when a provider id has no registered lifecycle capability', () => {
    const registry = new PublicEmberPluginRegistry();

    expect(registry.getLifecycleCapability('missing-provider')).toBeUndefined();
  });
});
