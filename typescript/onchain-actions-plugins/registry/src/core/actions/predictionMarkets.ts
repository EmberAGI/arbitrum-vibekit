import type {
  PlaceOrderRequest,
  PlaceOrderResponse,
  CancelOrderRequest,
  CancelOrderResponse,
  RedeemRequest,
  RedeemResponse,
} from '../schemas/predictionMarkets.js';

/**
 * Callback for placing an order in a prediction market.
 * Can be used for both buy and sell orders on any outcome.
 */
export type PredictionMarketsPlaceOrderCallback = (
  request: PlaceOrderRequest
) => Promise<PlaceOrderResponse>;

/**
 * Callback for canceling an order in a prediction market.
 */
export type PredictionMarketsCancelOrderCallback = (
  request: CancelOrderRequest
) => Promise<CancelOrderResponse>;

/**
 * Callback for redeeming/claiming winnings from a resolved market.
 */
export type PredictionMarketsRedeemCallback = (
  request: RedeemRequest
) => Promise<RedeemResponse>;

/**
 * Available action types for prediction markets plugins.
 */
export type PredictionMarketsActions =
  | 'predictionMarkets-placeOrder'
  | 'predictionMarkets-cancelOrder'
  | 'predictionMarkets-redeem';
