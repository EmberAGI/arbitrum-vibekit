/**
 * Clients - Module Exports
 */

export {
  // Factory functions
  createAdapterFromEnv,
  // Direct API functions (no auth)
  fetchMarketsFromGamma,
  fetchMarketPrices,
  // Types
  type PolymarketAdapterParams,
  type IPolymarketAdapter,
  type PerpetualMarket,
  type CreatePositionRequest,
  type CreatePositionResponse,
  type GetMarketsResponse,
  type MarketPrices,
  // New types for cross-arbitrage
  type PlaceOrderRequest,
  type PlaceOrderResponse,
  type UserPosition,
} from './polymarketClient.js';
