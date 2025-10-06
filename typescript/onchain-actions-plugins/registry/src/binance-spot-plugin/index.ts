/**
 * Binance Spot Trading Plugin
 * Provides spot trading capabilities through Binance API
 */

import type { ActionDefinition, EmberPlugin, SwapActions } from '../core/index.js';
import { BinanceSpotAdapter, type BinanceAdapterParams } from './adapter.js';
import type { ChainConfig } from '../chainConfig.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

/**
 * Get the Binance Spot Ember plugin.
 * @param params - Configuration parameters for the BinanceSpotAdapter, including API credentials.
 * @returns The Binance Spot Ember plugin.
 */
export async function getBinanceSpotPlugin(
  params: BinanceAdapterParams
): Promise<EmberPlugin<'swap'>> {
  const adapter = new BinanceSpotAdapter(params);

  return {
    id: `BINANCE_SPOT_${params.testnet ? 'TESTNET' : 'MAINNET'}`,
    type: 'swap',
    name: `Binance Spot Trading ${params.testnet ? '(Testnet)' : ''}`,
    description: 'Binance spot trading protocol for cryptocurrency swaps',
    website: 'https://www.binance.com',
    x: 'https://x.com/binance',
    actions: await getBinanceSpotActions(adapter),
    queries: {}, // Swap plugins don't have queries in the current schema
  };
}

/**
 * Get the Binance Spot actions for the swap protocol.
 * @param adapter - An instance of BinanceSpotAdapter to interact with the Binance API.
 * @returns An array of action definitions for the Binance spot trading protocol.
 */
export async function getBinanceSpotActions(
  adapter: BinanceSpotAdapter
): Promise<ActionDefinition<SwapActions>[]> {
  // Load available tokens for input/output token definitions
  const availableTokens = await adapter.getAvailableTokens();
  
  // Create token sets for input and output tokens
  const tokenSets = [{
    chainId: 'binance-spot',
    tokens: availableTokens.map(token => token.tokenUid.address),
  }];

  return [
    {
      type: 'swap',
      name: 'Binance Spot Trading',
      inputTokens: async () => Promise.resolve(tokenSets),
      outputTokens: async () => Promise.resolve(tokenSets),
      callback: adapter.createSwapTransaction.bind(adapter),
    },
  ];
}

/**
 * Register the Binance Spot plugin.
 * @param params - Configuration parameters for the Binance adapter.
 * @param registry - The public Ember plugin registry.
 */
export function registerBinanceSpot(
  params: BinanceAdapterParams,
  registry: PublicEmberPluginRegistry
) {
  // Check if API credentials are provided
  if (!params.apiKey || !params.apiSecret) {
    console.warn('Binance Spot plugin: API credentials not provided, skipping registration');
    return;
  }

  registry.registerDeferredPlugin(
    getBinanceSpotPlugin(params)
  );
}

/**
 * Register the Binance Spot plugin with chain configuration.
 * This is a convenience function that extracts API credentials from environment variables.
 * @param chainConfig - Chain configuration (not used for Binance, but kept for consistency).
 * @param registry - The public Ember plugin registry.
 */
export function registerBinanceSpotWithChainConfig(
  chainConfig: ChainConfig,
  registry: PublicEmberPluginRegistry
) {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  const testnet = process.env.BINANCE_TESTNET === 'true';
  const useMMSubdomain = process.env.BINANCE_USE_MM_SUBDOMAIN === 'true';

  if (!apiKey || !apiSecret) {
    console.warn('Binance Spot plugin: BINANCE_API_KEY and BINANCE_API_SECRET environment variables not set, skipping registration');
    return;
  }

  registerBinanceSpot({
    apiKey,
    apiSecret,
    testnet,
    useMMSubdomain,
  }, registry);
}
