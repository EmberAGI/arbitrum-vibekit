import type { ChainConfig } from '../chainConfig.js';
import type { ActionDefinition, EmberPlugin, LendingActions } from '../core/index.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

import { CompoundAdapter, type CompoundAdapterParams } from './adapter.js';
import { getMarketsForChain } from './market.js';

/**
 * Get the Compound V3 Ember plugin for a specific market.
 * @param params - Configuration parameters for the CompoundAdapter, including chainId, rpcUrl, and marketId.
 * @returns The Compound V3 Ember plugin.
 */
export function getCompoundEmberPlugin(params: CompoundAdapterParams): EmberPlugin<'lending'> {
  const adapter = new CompoundAdapter(params);

  return {
    id: `COMPOUND_V3_CHAIN_${params.chainId}_MARKET_${params.marketId}`,
    type: 'lending',
    name: `Compound V3 ${params.marketId} market on chain ${params.chainId}`,
    description: 'Compound V3 (Comet) lending protocol',
    website: 'https://compound.finance',
    x: 'https://x.com/compoundfinance',
    actions: getCompoundActions(adapter),
    queries: {
      getPositions: adapter.getUserSummary.bind(adapter),
    },
  };
}

/**
 * Get the Compound V3 actions for the lending protocol.
 * @param adapter - An instance of CompoundAdapter to interact with the Compound V3 protocol.
 * @returns An array of action definitions for the Compound V3 lending protocol.
 */
export function getCompoundActions(_adapter: CompoundAdapter): ActionDefinition<LendingActions>[] {
  // Transaction methods are not yet implemented
  // Will be populated when we implement:
  // - createSupplyTransaction
  // - createWithdrawTransaction
  // - createBorrowTransaction
  // - createRepayTransaction
  return [];
}

/**
 * Register Compound V3 plugins for the specified chain configuration.
 * Creates a plugin for each available market on the chain.
 * @param chainConfig - The chain configuration to check for Compound V3 support.
 * @param registry - The public Ember plugin registry to register the plugins with.
 */
export function registerCompound(chainConfig: ChainConfig, registry: PublicEmberPluginRegistry) {
  const supportedChains = [1, 42161, 8453]; // Ethereum, Arbitrum, Base
  if (!supportedChains.includes(chainConfig.chainId)) {
    return;
  }

  // Get all markets for this chain
  const markets = getMarketsForChain(chainConfig.chainId);
  const marketIds = Object.keys(markets);

  // Register a plugin for each market
  for (const marketId of marketIds) {
    const plugin = getCompoundEmberPlugin({
      chainId: chainConfig.chainId,
      rpcUrl: chainConfig.rpcUrl,
      marketId,
      wrappedNativeToken: chainConfig.wrappedNativeToken,
    });
    registry.registerPlugin(plugin);
  }
}
