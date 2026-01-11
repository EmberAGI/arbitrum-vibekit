import type { ChainConfig } from '../chainConfig.js';
import type {
  ActionDefinition,
  EmberPlugin,
  PredictionMarketsActions,
} from '../core/index.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

import {
  PolymarketAdapter,
  fetchMarketPrices,
  type PolymarketAdapterParams,
  type MarketPrices,
} from './adapter.js';

// Re-export price fetching utilities
export { fetchMarketPrices, type MarketPrices };

/**
 * Get the Polymarket Ember plugin for prediction market trading.
 * @param params - Configuration parameters for the PolymarketAdapter.
 * @returns The Polymarket Ember plugin.
 */
export async function getPolymarketEmberPlugin(
  params: PolymarketAdapterParams,
): Promise<EmberPlugin<'predictionMarkets'>> {
  const adapter = new PolymarketAdapter(params);

  return {
    id: `POLYMARKET_CHAIN_${params.chainId}`,
    type: 'predictionMarkets',
    name: `Polymarket prediction markets on Polygon`,
    description: 'Polymarket CLOB integration for prediction market trading',
    website: 'https://polymarket.com',
    x: 'https://x.com/polymarket',
    actions: await getPolymarketActions(adapter),
    queries: {
      getMarkets: adapter.getMarkets.bind(adapter),
      getPositions: adapter.getPositions.bind(adapter),
      getOrders: adapter.getOrders.bind(adapter),
      // Additional methods exposed on the adapter for advanced usage:
      // - getTradingHistory
      // - getUserEarnings
      // - getPriceHistory
      // - getMarketTrades
      // - getTokenBalances
      // - getComprehensiveWalletData
    },
  };
}

/**
 * Get the Polymarket actions for prediction market trading.
 * @param adapter - An instance of PolymarketAdapter.
 * @returns An array of action definitions for Polymarket prediction markets.
 */
export async function getPolymarketActions(
  adapter: PolymarketAdapter,
): Promise<ActionDefinition<PredictionMarketsActions>[]> {
  // Fetch available tokens from markets
  const { usdc, yesTokens, noTokens } = await adapter.getAvailableTokens();
  const allOutcomeTokens = [...yesTokens, ...noTokens];

  return [
    {
      type: 'predictionMarkets-placeOrder',
      name: 'Polymarket Place Order',
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137', // Polygon
            tokens: [usdc], // USDC for payment
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137',
            tokens: allOutcomeTokens, // All outcome tokens
          },
        ]),
      callback: adapter.placeOrder.bind(adapter),
    },
    {
      type: 'predictionMarkets-cancelOrder',
      name: 'Polymarket Cancel Order',
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137',
            tokens: [], // Orders don't require input tokens
          },
        ]),
      outputTokens: async () => Promise.resolve([]),
      callback: adapter.cancelOrder.bind(adapter),
    },
    {
      type: 'predictionMarkets-redeem',
      name: 'Polymarket Redeem Winnings',
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137',
            tokens: allOutcomeTokens, // Outcome tokens to redeem
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137',
            tokens: [usdc], // USDC payout
          },
        ]),
      callback: adapter.redeem.bind(adapter),
    },
  ];
}

/**
 * Register the Polymarket plugin for the specified chain configuration.
 * @param chainConfig - The chain configuration to check for Polymarket support.
 * @param registry - The public Ember plugin registry to register the plugin with.
 * @param params - Optional Polymarket adapter parameters (private key, funder address, etc.).
 * @returns A promise that resolves when the plugin is registered.
 */
export function registerPolymarket(
  chainConfig: ChainConfig,
  registry: PublicEmberPluginRegistry,
  params?: Omit<PolymarketAdapterParams, 'chainId' | 'host'>,
) {
  const supportedChains = [137]; // Polygon mainnet
  if (!supportedChains.includes(chainConfig.chainId)) {
    return;
  }

  if (!params?.funderAddress || !params?.privateKey) {
    // Skip registration if credentials not provided
    return;
  }

  registry.registerDeferredPlugin(
    getPolymarketEmberPlugin({
      chainId: chainConfig.chainId,
      funderAddress: params.funderAddress,
      privateKey: params.privateKey,
      signatureType: params.signatureType,
      maxOrderSize: params.maxOrderSize,
      maxOrderNotional: params.maxOrderNotional,
      gammaApiUrl: params.gammaApiUrl,
      dataApiUrl: params.dataApiUrl,
    }),
  );
}
