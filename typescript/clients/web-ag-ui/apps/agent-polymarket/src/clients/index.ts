/**
 * Clients - Module Exports
 */

export {
  PolymarketAdapter,
  createAdapterFromEnv,
  createMockAdapter,
  fetchMarketsFromGamma,
  fetchMarketPrices,
  type PolymarketAdapterParams,
  type IPolymarketAdapter,
  type PerpetualMarket,
  type CreatePositionRequest,
  type CreatePositionResponse,
  type GetMarketsResponse,
} from './polymarketClient.js';
