import { PublicEmberPluginRegistry } from './registry.js';
import { getAaveEmberPlugin, type AAVEAdapterParams } from '@ember/aave-lending-plugin';

/**
 * Initialize the public Ember plugin registry.
 * @returns The initialized public Ember plugin registry with registered plugins.
 */
export function initializePublicRegistry(aaveParams: AAVEAdapterParams) {
  const registry = new PublicEmberPluginRegistry();

  // Register any plugin in here
  registry.registerDeferredPlugin(getAaveEmberPlugin(aaveParams));

  return registry;
}
