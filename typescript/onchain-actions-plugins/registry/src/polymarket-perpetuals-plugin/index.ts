import type { ChainConfig } from '../chainConfig.js';
import type {
  ActionDefinition,
  EmberPlugin,
  PerpetualsActions,
} from '../core/index.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

import { PolymarketAdapter, type PolymarketAdapterParams } from './adapter.js';

/**
 * Get the Polymarket Ember plugin for prediction market trading.
 * @param params - Configuration parameters for the PolymarketAdapter.
 * @returns The Polymarket Ember plugin.
 */
export async function getPolymarketEmberPlugin(
  params: PolymarketAdapterParams,
): Promise<EmberPlugin<'perpetuals'>> {
  const adapter = new PolymarketAdapter(params);

  return {
    id: `POLYMARKET_CHAIN_${params.chainId}`,
    type: 'perpetuals',
    name: `Polymarket prediction markets on Polygon`,
    description: 'Polymarket CLOB integration for prediction market trading',
    website: 'https://polymarket.com',
    x: 'https://x.com/polymarket',
    actions: await getPolymarketActions(adapter),
    queries: {
      getMarkets: adapter.getMarkets.bind(adapter),
      getPositions: adapter.getPositions.bind(adapter),
      getOrders: adapter.getOrders.bind(adapter),
      // New comprehensive wallet analysis methods
      getTradingHistory: adapter.getTradingHistory.bind(adapter),
      getUserEarnings: adapter.getUserEarnings.bind(adapter),
      getPriceHistory: adapter.getPriceHistory.bind(adapter),
      getMarketTrades: adapter.getMarketTrades.bind(adapter),
      getTokenBalances: adapter.getTokenBalances.bind(adapter),
      getComprehensiveWalletData: adapter.getComprehensiveWalletData.bind(adapter),
    },
  };
}

/**
 * Get the Polymarket actions for prediction market trading.
 * @param adapter - An instance of PolymarketAdapter.
 * @returns An array of action definitions for Polymarket perpetuals.
 */
export async function getPolymarketActions(
  adapter: PolymarketAdapter,
): Promise<ActionDefinition<PerpetualsActions>[]> {
  // For Polymarket, we map:
  // - perpetuals-long → BUY YES token
  // - perpetuals-short → BUY NO token (or SELL YES)
  // - perpetuals-close → Cancel orders

  // Fetch available tokens from markets
  const { usdc, yesTokens, noTokens } = await adapter.getAvailableTokens();

  return [
    {
      type: 'perpetuals-long',
      name: 'Polymarket BUY YES (Long Position)',
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137', // Polygon
            tokens: [usdc, ...yesTokens], // USDC for payment, YES tokens for output
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137',
            tokens: yesTokens, // YES token addresses
          },
        ]),
      callback: adapter.createLongPosition.bind(adapter),
    },
    {
      type: 'perpetuals-short',
      name: 'Polymarket BUY NO (Short Position)',
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137',
            tokens: [usdc, ...noTokens], // USDC for payment, NO tokens for output
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137',
            tokens: noTokens, // NO token addresses
          },
        ]),
      callback: adapter.createShortPosition.bind(adapter),
    },
    {
      type: 'perpetuals-close',
      name: 'Polymarket Cancel Orders',
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: '137',
            tokens: [], // Orders don't require input tokens
          },
        ]),
      outputTokens: async () => Promise.resolve([]),
      callback: adapter.closeOrders.bind(adapter),
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
    }),
  );
}

