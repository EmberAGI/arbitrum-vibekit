import type {
  GetMarketsRequest,
  GetMarketsResponse,
  GetMarketDetailsRequest,
  GetMarketDetailsResponse,
  GetPositionsRequest,
  GetPositionsResponse,
  GetOrdersRequest,
  GetOrdersResponse,
} from '../schemas/predictionMarkets.js';

/**
 * Query to get available prediction markets.
 */
export type PredictionMarketsGetMarkets = (
  request: GetMarketsRequest
) => Promise<GetMarketsResponse>;

/**
 * Query to get detailed information about a specific market.
 */
export type PredictionMarketsGetMarketDetails = (
  request: GetMarketDetailsRequest
) => Promise<GetMarketDetailsResponse>;

/**
 * Query to get user's positions in prediction markets.
 */
export type PredictionMarketsGetPositions = (
  request: GetPositionsRequest
) => Promise<GetPositionsResponse>;

/**
 * Query to get user's orders in prediction markets.
 */
export type PredictionMarketsGetOrders = (
  request: GetOrdersRequest
) => Promise<GetOrdersResponse>;

/**
 * Available queries for prediction markets plugins.
 */
export type PredictionMarketsQueries = {
  getMarkets: PredictionMarketsGetMarkets;
  getMarketDetails?: PredictionMarketsGetMarketDetails;
  getPositions: PredictionMarketsGetPositions;
  getOrders: PredictionMarketsGetOrders;
};
