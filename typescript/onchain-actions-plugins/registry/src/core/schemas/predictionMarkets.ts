import { z } from 'zod';

import { TransactionPlanSchema } from './core.js';

// ============================================================================
// Enums
// ============================================================================

/**
 * Status of a prediction market.
 */
export const PredictionMarketStatusSchema = z.enum([
  'active',
  'resolved',
  'voided',
  'paused',
]);
export type PredictionMarketStatus = z.infer<typeof PredictionMarketStatusSchema>;

/**
 * Side of an order (buy or sell shares).
 */
export const PredictionOrderSideSchema = z.enum(['buy', 'sell']);
export type PredictionOrderSide = z.infer<typeof PredictionOrderSideSchema>;

/**
 * Status of an order.
 */
export const PredictionOrderStatusSchema = z.enum([
  'open',
  'filled',
  'partially_filled',
  'cancelled',
  'expired',
]);
export type PredictionOrderStatus = z.infer<typeof PredictionOrderStatusSchema>;

/**
 * Time-in-force for orders.
 */
export const TimeInForceSchema = z.enum(['GTC', 'IOC', 'FOK', 'GTD']);
export type TimeInForce = z.infer<typeof TimeInForceSchema>;

// ============================================================================
// Core Schemas
// ============================================================================

/**
 * Represents an outcome option in a prediction market.
 * Each market has multiple outcomes (e.g., YES/NO, or named candidates).
 */
export const PredictionOutcomeSchema = z.object({
  /** Unique identifier for this outcome within the market */
  outcomeId: z.string(),
  /** Human-readable name (e.g., "Yes", "No", "Candidate A") */
  name: z.string(),
  /** ERC-1155 token ID for this outcome (can differ from outcomeId) */
  tokenId: z.string().optional(),
  /** Current price as decimal string (0-1 range for probability) */
  price: z.string(),
  /** Probability as decimal string (0-1 range), optional if price is normalized */
  probability: z.string().optional(),
  /** Available liquidity for this outcome */
  liquidity: z.string().optional(),
});
export type PredictionOutcome = z.infer<typeof PredictionOutcomeSchema>;

/**
 * Represents a prediction market.
 * IMPORTANT: marketId !== outcomeTokenId - these are separate concepts.
 */
export const PredictionMarketSchema = z.object({
  /** Unique market identifier */
  marketId: z.string(),
  /** Chain ID where the market exists */
  chainId: z.string(),
  /** Market question/title */
  title: z.string(),
  /** Current market status */
  status: PredictionMarketStatusSchema,
  /** Market end/resolution time as ISO string */
  endTime: z.string(),
  /** Resolved outcome ID if market is resolved, null otherwise */
  resolutionOutcome: z.string().nullable(),
  /** Oracle or resolution source information */
  oracle: z.string().optional(),
  /** Category/tag for the market */
  category: z.string().optional(),
  /** All possible outcomes for this market */
  outcomes: z.array(PredictionOutcomeSchema),
  /** Total volume traded in the market */
  volume: z.string().optional(),
  /** Total liquidity available */
  liquidity: z.string().optional(),
  /** Market image/icon URL */
  imageUrl: z.string().optional(),
  /** URL slug for the market */
  slug: z.string().optional(),
  /** Quote token address (e.g., USDC) used for trading */
  quoteTokenAddress: z.string().optional(),
  /** Minimum tick size for orders */
  tickSize: z.string().optional(),
  /** Whether this is a negative risk market */
  negRisk: z.boolean().optional(),
});
export type PredictionMarket = z.infer<typeof PredictionMarketSchema>;

/**
 * Represents a user's position in a prediction market.
 * Share-based model without leverage/funding/borrowing fields.
 */
export const PredictionPositionSchema = z.object({
  /** Market ID this position belongs to */
  marketId: z.string(),
  /** Outcome ID for this position */
  outcomeId: z.string(),
  /** Token ID for the outcome (if different from outcomeId) */
  tokenId: z.string().optional(),
  /** Chain ID */
  chainId: z.string(),
  /** Owner's wallet address */
  walletAddress: z.string(),
  /** Number of shares held */
  size: z.string(),
  /** Average entry price per share */
  avgPrice: z.string().optional(),
  /** Total cost basis */
  cost: z.string().optional(),
  /** Unrealized profit/loss */
  pnl: z.string().optional(),
  /** Quote token address used for this position */
  quoteTokenAddress: z.string().optional(),
  /** Market title for display */
  marketTitle: z.string().optional(),
  /** Outcome name for display */
  outcomeName: z.string().optional(),
  /** Current price of the outcome token */
  currentPrice: z.string().optional(),
  /** Current value of the position */
  currentValue: z.string().optional(),
});
export type PredictionPosition = z.infer<typeof PredictionPositionSchema>;

/**
 * Represents an order in a prediction market.
 */
export const PredictionOrderSchema = z.object({
  /** Unique order identifier */
  orderId: z.string(),
  /** Market ID */
  marketId: z.string(),
  /** Outcome ID being traded */
  outcomeId: z.string(),
  /** Token ID for the outcome */
  tokenId: z.string().optional(),
  /** Chain ID */
  chainId: z.string(),
  /** Order side (buy/sell) */
  side: PredictionOrderSideSchema,
  /** Limit price (0-1 range for probability) */
  price: z.string(),
  /** Order size in shares */
  size: z.string(),
  /** Filled size */
  filledSize: z.string().optional(),
  /** Order status */
  status: PredictionOrderStatusSchema,
  /** Creation timestamp */
  createdAt: z.string(),
  /** Last update timestamp */
  updatedAt: z.string().optional(),
  /** Expiration timestamp (for GTD orders) */
  expiresAt: z.string().optional(),
  /** Owner's wallet address */
  walletAddress: z.string(),
});
export type PredictionOrder = z.infer<typeof PredictionOrderSchema>;

// ============================================================================
// Request/Response Schemas for Actions
// ============================================================================

/**
 * Request to place an order in a prediction market.
 */
export const PlaceOrderRequestSchema = z.object({
  /** Chain ID */
  chainId: z.string(),
  /** Wallet address placing the order */
  walletAddress: z.string(),
  /** Market ID */
  marketId: z.string(),
  /** Outcome ID to trade */
  outcomeId: z.string(),
  /** Order side (buy/sell) */
  side: PredictionOrderSideSchema,
  /** Number of shares to trade */
  size: z.string(),
  /** Limit price (optional for market orders) */
  price: z.string().optional(),
  /** Quote token address (e.g., USDC) */
  quoteTokenAddress: z.string().optional(),
  /** Time in force (default: GTC) */
  timeInForce: TimeInForceSchema.optional(),
  /** Expiration time for GTD orders */
  expiration: z.string().optional(),
});
export type PlaceOrderRequest = z.infer<typeof PlaceOrderRequestSchema>;

/**
 * Response after placing an order.
 */
export const PlaceOrderResponseSchema = z.object({
  /** Order ID if order was created */
  orderId: z.string().optional(),
  /** Transactions to execute (can be empty for off-chain matching) */
  transactions: z.array(TransactionPlanSchema),
  /** Whether the order was successfully placed */
  success: z.boolean().optional(),
  /** Error message if order failed */
  error: z.string().optional(),
});
export type PlaceOrderResponse = z.infer<typeof PlaceOrderResponseSchema>;

/**
 * Request to cancel an order.
 */
export const CancelOrderRequestSchema = z.object({
  /** Chain ID */
  chainId: z.string(),
  /** Wallet address that owns the order */
  walletAddress: z.string(),
  /** Order ID to cancel, or 'all' to cancel all orders */
  orderId: z.string(),
});
export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;

/**
 * Response after canceling an order.
 */
export const CancelOrderResponseSchema = z.object({
  /** Transactions to execute (can be empty for off-chain cancellation) */
  transactions: z.array(TransactionPlanSchema),
  /** Whether the cancellation was successful */
  success: z.boolean().optional(),
  /** Number of orders cancelled (for 'all' cancellation) */
  cancelledCount: z.number().optional(),
});
export type CancelOrderResponse = z.infer<typeof CancelOrderResponseSchema>;

/**
 * Request to redeem/claim winnings from a resolved market.
 */
export const RedeemRequestSchema = z.object({
  /** Chain ID */
  chainId: z.string(),
  /** Wallet address to receive winnings */
  walletAddress: z.string(),
  /** Market ID */
  marketId: z.string(),
  /** Outcome ID to redeem (optional, redeem all if not specified) */
  outcomeId: z.string().optional(),
  /** Amount to redeem (optional, redeem all if not specified) */
  amount: z.string().optional(),
});
export type RedeemRequest = z.infer<typeof RedeemRequestSchema>;

/**
 * Response after redeeming winnings.
 */
export const RedeemResponseSchema = z.object({
  /** Transactions to execute */
  transactions: z.array(TransactionPlanSchema),
  /** Amount redeemed */
  redeemedAmount: z.string().optional(),
  /** Whether redemption was successful */
  success: z.boolean().optional(),
});
export type RedeemResponse = z.infer<typeof RedeemResponseSchema>;

// ============================================================================
// Request/Response Schemas for Queries
// ============================================================================

/**
 * Request to get prediction markets.
 */
export const GetMarketsRequestSchema = z.object({
  /** Chain IDs to filter by */
  chainIds: z.array(z.string()),
  /** Filter by market status */
  status: PredictionMarketStatusSchema.optional(),
  /** Filter by category */
  category: z.string().optional(),
  /** Filter markets ending before this time (ISO string) */
  endTimeBefore: z.string().optional(),
  /** Filter markets ending after this time (ISO string) */
  endTimeAfter: z.string().optional(),
  /** Minimum liquidity filter */
  minLiquidity: z.string().optional(),
  /** Maximum number of markets to return */
  limit: z.number().optional(),
  /** Offset for pagination */
  offset: z.number().optional(),
  /** Search query for market titles */
  searchQuery: z.string().optional(),
});
export type GetMarketsRequest = z.infer<typeof GetMarketsRequestSchema>;

/**
 * Response containing prediction markets.
 */
export const GetMarketsResponseSchema = z.object({
  /** List of prediction markets */
  markets: z.array(PredictionMarketSchema),
  /** Total count for pagination */
  totalCount: z.number().optional(),
});
export type GetMarketsResponse = z.infer<typeof GetMarketsResponseSchema>;

/**
 * Request to get detailed market information.
 */
export const GetMarketDetailsRequestSchema = z.object({
  /** Chain ID */
  chainId: z.string(),
  /** Market ID */
  marketId: z.string(),
});
export type GetMarketDetailsRequest = z.infer<typeof GetMarketDetailsRequestSchema>;

/**
 * Response with detailed market information.
 */
export const GetMarketDetailsResponseSchema = z.object({
  /** Detailed market information */
  market: PredictionMarketSchema.nullable(),
});
export type GetMarketDetailsResponse = z.infer<typeof GetMarketDetailsResponseSchema>;

/**
 * Request to get user positions.
 */
export const GetPositionsRequestSchema = z.object({
  /** Wallet address */
  walletAddress: z.string(),
  /** Filter by specific market IDs */
  marketIds: z.array(z.string()).optional(),
  /** Include resolved/settled positions */
  includeResolved: z.boolean().optional(),
  /** Chain IDs to filter by */
  chainIds: z.array(z.string()).optional(),
});
export type GetPositionsRequest = z.infer<typeof GetPositionsRequestSchema>;

/**
 * Response containing user positions.
 */
export const GetPositionsResponseSchema = z.object({
  /** List of positions */
  positions: z.array(PredictionPositionSchema),
});
export type GetPositionsResponse = z.infer<typeof GetPositionsResponseSchema>;

/**
 * Request to get user orders.
 */
export const GetOrdersRequestSchema = z.object({
  /** Wallet address */
  walletAddress: z.string(),
  /** Filter by specific market IDs */
  marketIds: z.array(z.string()).optional(),
  /** Filter by order status */
  status: PredictionOrderStatusSchema.optional(),
  /** Chain IDs to filter by */
  chainIds: z.array(z.string()).optional(),
});
export type GetOrdersRequest = z.infer<typeof GetOrdersRequestSchema>;

/**
 * Response containing user orders.
 */
export const GetOrdersResponseSchema = z.object({
  /** List of orders */
  orders: z.array(PredictionOrderSchema),
});
export type GetOrdersResponse = z.infer<typeof GetOrdersResponseSchema>;
