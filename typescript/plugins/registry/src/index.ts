import type { ChainConfig } from './chainConfig.js';
import { PublicEmberPluginRegistry } from './registry.js';
import { getAaveEmberPlugin, type AAVEAdapterParams } from '@ember/aave-lending-plugin';

/**
 * Initialize the public Ember plugin registry.
 * @returns The initialized public Ember plugin registry with registered plugins.
 */
export function initializePublicRegistry(chainConfigs: ChainConfig[]) {
  const registry = new PublicEmberPluginRegistry();

  // Register any plugin in here
  for (const chainConfig of chainConfigs) {
    // Create aave plugins for each chain config
    registry.registerDeferredPlugin(
      getAaveEmberPlugin({
        chainId: chainConfig.chainId,
        rpcUrl: chainConfig.rpcUrl,
        wrappedNativeToken: chainConfig.wrappedNativeToken,
      })
    );
  }

  return registry;
}
