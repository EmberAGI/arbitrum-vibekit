import type { ChainConfig } from './chainConfig.js';
import { PublicEmberPluginRegistry } from './registry.js';
import { registerAave } from './aave-lending-plugin/index.js';
import { registerPancakeSwapSwap } from './pancakeswap-swap-plugin/index.js';
import { registerPancakeSwapLiquidity } from './pancakeswap-liquidity-plugin/index.js';

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
    // Create PancakeSwap plugins for each chain config
    registerPancakeSwapSwap(chainConfig, registry);
    registerPancakeSwapLiquidity(chainConfig, registry);
  }

  return registry;
}

export { type ChainConfig, PublicEmberPluginRegistry };
export * from './core/index.js';
