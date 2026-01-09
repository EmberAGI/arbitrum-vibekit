/**
 * Polymarket Plugin Client
 *
 * Uses the PolymarketAdapter from the plugin.
 * Plugin path: typescript/onchain-actions-plugins/registry/src/polymarket-perpetuals-plugin
 *
 * Uses runtime dynamic import to avoid compile-time dependency resolution issues.
 */

import { logInfo } from '../workflow/context.js';

/**
 * Type definitions matching the PolymarketAdapter interface.
 */
export interface PolymarketAdapterParams {
  host?: string;
  chainId: number;
  funderAddress: string;
  privateKey: string;
  signatureType?: number;
  maxOrderSize?: number;
  maxOrderNotional?: number;
  gammaApiUrl?: string;
  dataApiUrl?: string;
}

export interface PerpetualMarket {
  name: string;
  marketToken: { address: string; chainId: string };
  longToken: { address: string; chainId: string };
  shortToken: { address: string; chainId: string };
  longFundingFee: string;
  shortFundingFee: string;
  longBorrowingFee: string;
  shortBorrowingFee: string;
  chainId: string;
}

export interface CreatePositionRequest {
  marketAddress: string;
  amount: string;
  limitPrice?: string;
  chainId: string;
}

export interface CreatePositionResponse {
  transactions: unknown[];
  orderId?: string;
}

export interface GetMarketsResponse {
  markets: PerpetualMarket[];
}

/**
 * Interface for the PolymarketAdapter.
 */
export interface IPolymarketAdapter {
  getMarkets(request: { chainIds: string[] }): Promise<GetMarketsResponse>;
  createLongPosition(request: CreatePositionRequest): Promise<CreatePositionResponse>;
  createShortPosition(request: CreatePositionRequest): Promise<CreatePositionResponse>;
}

// Cached adapter instance
let cachedAdapter: IPolymarketAdapter | null = null;

/**
 * Get the plugin module path.
 * Using a function to prevent TypeScript from resolving the import at compile time.
 */
function getPluginPath(): string {
  // Path from dist/clients/ to the plugin
  // At runtime: dist/clients/polymarketClient.js
  // Plugin: ../../../../../../onchain-actions-plugins/registry/src/polymarket-perpetuals-plugin/adapter.js
  return '../../../../../../onchain-actions-plugins/registry/src/polymarket-perpetuals-plugin/adapter.js';
}

/**
 * Dynamically import and create the PolymarketAdapter.
 */
export async function createAdapterFromEnv(): Promise<IPolymarketAdapter | null> {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  const privateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
  const funderAddress = process.env['POLY_FUNDER_ADDRESS'];

  if (!privateKey || !funderAddress) {
    logInfo('Missing credentials for PolymarketAdapter', {
      hasPrivateKey: !!privateKey,
      hasFunderAddress: !!funderAddress,
    });
    return null;
  }

  try {
    const pluginPath = getPluginPath();
    logInfo('Loading PolymarketAdapter from plugin...', { pluginPath });

    // Dynamic import with variable path prevents TypeScript from tracing
    const pluginModule = await import(/* webpackIgnore: true */ pluginPath);

    const AdapterClass = pluginModule.PolymarketAdapter;

    cachedAdapter = new AdapterClass({
      chainId: 137,
      host: process.env['POLYMARKET_CLOB_API'] ?? 'https://clob.polymarket.com',
      funderAddress,
      privateKey,
      signatureType: parseInt(process.env['POLY_SIGNATURE_TYPE'] ?? '1', 10),
      maxOrderSize: parseInt(process.env['POLY_MAX_ORDER_SIZE'] ?? '100', 10),
      maxOrderNotional: parseInt(process.env['POLY_MAX_ORDER_NOTIONAL'] ?? '500', 10),
      gammaApiUrl: process.env['POLYMARKET_GAMMA_API'] ?? 'https://gamma-api.polymarket.com',
      dataApiUrl: process.env['POLYMARKET_DATA_API'] ?? 'https://data-api.polymarket.com',
    }) as IPolymarketAdapter;

    logInfo('PolymarketAdapter created successfully');
    return cachedAdapter;
  } catch (error) {
    logInfo('Failed to create PolymarketAdapter', { error: String(error) });
    return null;
  }
}

/**
 * Create a mock adapter for testing.
 */
export function createMockAdapter(): IPolymarketAdapter {
  return {
    getMarkets: async () => {
      logInfo('[MOCK] getMarkets called');
      return { markets: [] };
    },
    createLongPosition: async (request) => {
      logInfo('[MOCK] createLongPosition called', { market: request.marketAddress.substring(0, 20) });
      return { transactions: [], orderId: `mock-yes-${Date.now()}` };
    },
    createShortPosition: async (request) => {
      logInfo('[MOCK] createShortPosition called', { market: request.marketAddress.substring(0, 20) });
      return { transactions: [], orderId: `mock-no-${Date.now()}` };
    },
  };
}
