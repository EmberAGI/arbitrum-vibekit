import { registerAave } from './aave-lending-plugin/index.js';
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
  }

  return registry;
}

export { type ChainConfig, PublicEmberPluginRegistry };
export * from './core/index.js';

// Polymarket plugin exports
export {
  getPolymarketEmberPlugin,
  getPolymarketActions,
  registerPolymarket,
} from './polymarket-perpetuals-plugin/index.js';
export {
  PolymarketAdapter,
  type PolymarketAdapterParams,
} from './polymarket-perpetuals-plugin/adapter.js';
