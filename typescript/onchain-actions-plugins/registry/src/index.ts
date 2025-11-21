import { registerAave } from './aave-lending-plugin/index.js';
import { registerCompound } from './compound-lending-plugin/index.js';
import type { ChainConfig } from './chainConfig.js';
import { PublicEmberPluginRegistry } from './registry.js';

/**
 * Initialize the public Ember plugin registry.
 * @returns The initialized public Ember plugin registry with registered plugins.
 */
export function initializePublicRegistry(chainConfigs: ChainConfig[]) {
  const registry = new PublicEmberPluginRegistry();

  // Register any plugin in here
  for (const chainConfig of chainConfigs) {
    // Create aave plugins for each chain config
    registerAave(chainConfig, registry);
    // Create compound v3 plugins for each chain config (registers all markets)
    registerCompound(chainConfig, registry);
  }

  return registry;
}

export { type ChainConfig, PublicEmberPluginRegistry };
export * from './core/index.js';
