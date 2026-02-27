import type { ChainConfig } from '../chainConfig.js';
import type { ActionDefinition, EmberPlugin, LendingActions } from '../core/index.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

import { RadiantAdapter, type RadiantAdapterParams } from './adapter.js';
import { radiantSupply, radiantWithdraw, radiantBorrow, radiantRepay, radiantSetCollateral, radiantUnsetCollateral } from './actions/index.js';

/**
 * Get the Radiant Ember plugin.
 * @param params - Configuration parameters for the RadiantAdapter, including chainId and rpcUrl.
 * @returns The Radiant Ember plugin.
 */
export async function getRadiantEmberPlugin(
  params: RadiantAdapterParams
): Promise<EmberPlugin<'lending'>> {
  const adapter = new RadiantAdapter(params);

  return {
    id: `RADIANT_V2_ARBITRUM`,
    type: 'lending',
    name: 'Radiant V2 Lending',
    description: 'Radiant Capital V2 lending protocol on Arbitrum',
    website: 'https://radiant.capital/',
    x: 'https://x.com/radiantcapital',
    actions: await getRadiantActions(adapter),
    queries: {
      getPositions: adapter.getUserSummary.bind(adapter),
    },
  };
}

/**
 * Get the Radiant actions for the lending protocol.
 * @param adapter - An instance of RadiantAdapter to interact with the Radiant protocol.
 * @returns An array of action definitions for the Radiant lending protocol.
 */
export async function getRadiantActions(
  adapter: RadiantAdapter
): Promise<ActionDefinition<LendingActions>[]> {
  return [
    {
      ...radiantSupply,
      inputTokens: () => radiantSupply.inputTokens(adapter),
      outputTokens: () => radiantSupply.outputTokens(adapter),
      callback: radiantSupply.callback(adapter),
    },
    {
      ...radiantWithdraw,
      inputTokens: () => radiantWithdraw.inputTokens(adapter),
      outputTokens: () => radiantWithdraw.outputTokens(adapter),
      callback: radiantWithdraw.callback(adapter),
    },
    {
      ...radiantBorrow,
      inputTokens: () => radiantBorrow.inputTokens(adapter),
      outputTokens: () => radiantBorrow.outputTokens(adapter),
      callback: radiantBorrow.callback(adapter),
    },
    {
      ...radiantRepay,
      inputTokens: () => radiantRepay.inputTokens(adapter),
      outputTokens: () => radiantRepay.outputTokens(adapter),
      callback: radiantRepay.callback(adapter),
    },
    {
      ...radiantSetCollateral,
      inputTokens: () => radiantSetCollateral.inputTokens(adapter),
      outputTokens: () => radiantSetCollateral.outputTokens(adapter),
      callback: radiantSetCollateral.callback(adapter),
    },
    {
      ...radiantUnsetCollateral,
      inputTokens: () => radiantUnsetCollateral.inputTokens(adapter),
      outputTokens: () => radiantUnsetCollateral.outputTokens(adapter),
      callback: radiantUnsetCollateral.callback(adapter),
    },
  ];
}

/**
 * Register the Radiant plugin for the specified chain configuration.
 * @param chainConfig - The chain configuration to check for Radiant support.
 * @param registry - The public Ember plugin registry to register the plugin with.
 * @returns A promise that resolves when the plugin is registered.
 */
export function registerRadiant(chainConfig: ChainConfig, registry: PublicEmberPluginRegistry) {
  const supportedChains = [42161]; // Arbitrum One
  if (!supportedChains.includes(chainConfig.chainId)) {
    return;
  }

  registry.registerDeferredPlugin(
    getRadiantEmberPlugin({
      chainId: chainConfig.chainId,
      rpcUrl: chainConfig.rpcUrl,
      wrappedNativeToken: chainConfig.wrappedNativeToken,
    })
  );
}
