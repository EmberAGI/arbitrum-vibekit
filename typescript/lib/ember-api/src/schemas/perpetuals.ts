import { z } from "zod";
import { TransactionPlanSchema, TokenIdentifierSchema } from "./core.js";
import { DecreasePositionSwapType, OrderType } from "@gmx-io/sdk/types/orders";

// Enums
export const OrderTypeSchema = z.nativeEnum(OrderType);
export const DecreasePositionSwapTypeSchema = z.nativeEnum(
  DecreasePositionSwapType,
);

// API Schemas and types
export const MarketSchema = z.object({
  name: z.string(),
  marketToken: z.string(),
  indexToken: z.string(),
  longToken: z.string(),
  shortToken: z.string(),
  isListed: z.boolean(),
});
export const MarketsSchema = z.object({
  markets: z.array(MarketSchema),
});
export type GMXMarkets = z.infer<typeof MarketSchema>[];

export const TokenSchema = z.object({
  symbol: z.string(),
  address: z.string(),
  decimals: z.number(),
});
export const TokensSchema = z.object({
  tokens: z.array(TokenSchema),
});
export type GMXTokens = z.infer<typeof TokenSchema>[];

export const MarketPoolTokensSchema = z.object({
  longToken: TokenSchema,
  shortToken: TokenSchema,
  indexToken: TokenSchema,
});

export const MarketInfoSchema = MarketSchema.merge(
  MarketPoolTokensSchema,
).extend({
  isDisabled: z.boolean(),

  longPoolAmount: z.string(),
  shortPoolAmount: z.string(),

  maxLongPoolAmount: z.string(),
  maxShortPoolAmount: z.string(),
  maxLongPoolUsdForDeposit: z.string(),
  maxShortPoolUsdForDeposit: z.string(),

  longPoolAmountAdjustment: z.string(),
  shortPoolAmountAdjustment: z.string(),

  poolValueMax: z.string(),
  poolValueMin: z.string(),

  reserveFactorLong: z.string(),
  reserveFactorShort: z.string(),

  openInterestReserveFactorLong: z.string(),
  openInterestReserveFactorShort: z.string(),

  maxOpenInterestLong: z.string(),
  maxOpenInterestShort: z.string(),

  borrowingFactorLong: z.string(),
  borrowingFactorShort: z.string(),
  borrowingExponentFactorLong: z.string(),
  borrowingExponentFactorShort: z.string(),

  fundingFactor: z.string(),
  fundingExponentFactor: z.string(),
  fundingIncreaseFactorPerSecond: z.string(),
  fundingDecreaseFactorPerSecond: z.string(),
  thresholdForStableFunding: z.string(),
  thresholdForDecreaseFunding: z.string(),
  minFundingFactorPerSecond: z.string(),
  maxFundingFactorPerSecond: z.string(),

  totalBorrowingFees: z.string(),

  positionImpactPoolAmount: z.string(),
  minPositionImpactPoolAmount: z.string(),
  positionImpactPoolDistributionRate: z.string(),

  minCollateralFactor: z.string(),
  minCollateralFactorForOpenInterestLong: z.string(),
  minCollateralFactorForOpenInterestShort: z.string(),

  swapImpactPoolAmountLong: z.string(),
  swapImpactPoolAmountShort: z.string(),

  maxPnlFactorForTradersLong: z.string(),
  maxPnlFactorForTradersShort: z.string(),

  claimableFundingAmountLong: z.string().optional(),
  claimableFundingAmountShort: z.string().optional(),

  longInterestUsd: z.string(),
  shortInterestUsd: z.string(),
  longInterestInTokens: z.string(),
  shortInterestInTokens: z.string(),

  positionFeeFactorForPositiveImpact: z.string(),
  positionFeeFactorForNegativeImpact: z.string(),
  positionImpactFactorPositive: z.string(),
  positionImpactFactorNegative: z.string(),
  maxPositionImpactFactorPositive: z.string(),
  maxPositionImpactFactorNegative: z.string(),
  maxPositionImpactFactorForLiquidations: z.string(),
  positionImpactExponentFactor: z.string(),

  swapFeeFactorForPositiveImpact: z.string(),
  swapFeeFactorForNegativeImpact: z.string(),
  atomicSwapFeeFactor: z.string(),
  swapImpactFactorPositive: z.string(),
  swapImpactFactorNegative: z.string(),
  swapImpactExponentFactor: z.string(),

  borrowingFactorPerSecondForLongs: z.string(),
  borrowingFactorPerSecondForShorts: z.string(),

  fundingFactorPerSecond: z.string(),
  longsPayShorts: z.boolean(),

  virtualPoolAmountForLongToken: z.string(),
  virtualPoolAmountForShortToken: z.string(),
  virtualInventoryForPositions: z.string(),

  virtualMarketId: z.string(),
  virtualLongTokenId: z.string(),
  virtualShortTokenId: z.string(),
});

export const PositionSchema = z.object({
  key: z.string(),
  contractKey: z.string(),
  account: z.string(),
  marketAddress: z.string(),
  collateralTokenAddress: z.string(),
  sizeInUsd: z.string(),
  sizeInTokens: z.string(),
  collateralAmount: z.string(),
  pendingBorrowingFeesUsd: z.string(),
  increasedAtTime: z.string(),
  decreasedAtTime: z.string(),
  isLong: z.boolean(),
  fundingFeeAmount: z.string(),
  claimableLongTokenAmount: z.string(),
  claimableShortTokenAmount: z.string(),
  isOpening: z.boolean().optional(),
  pnl: z.string(),
  positionFeeAmount: z.string(),
  traderDiscountAmount: z.string(),
  uiFeeAmount: z.string(),
  data: z.string(),
});

export const PositionInfoSchema = PositionSchema.extend({
  marketInfo: MarketInfoSchema.optional(),
  market: MarketSchema,
  indexToken: TokenSchema,
  longToken: TokenSchema,
  shortToken: TokenSchema,
  indexName: z.string(),
  poolName: z.string(),
  collateralToken: TokenSchema,
  pnlToken: TokenSchema,
  markPrice: z.string(),
  entryPrice: z.string().optional(),
  liquidationPrice: z.string().optional(),
  collateralUsd: z.string(),
  remainingCollateralUsd: z.string(),
  remainingCollateralAmount: z.string(),
  hasLowCollateral: z.boolean(),
  pnl: z.string(),
  pnlPercentage: z.string(),
  pnlAfterFees: z.string(),
  pnlAfterFeesPercentage: z.string(),
  leverage: z.string().optional(),
  leverageWithPnl: z.string().optional(),
  netValue: z.string(),
  closingFeeUsd: z.string(),
  uiFeeUsd: z.string(),
  pendingFundingFeesUsd: z.string(),
  pendingClaimableFundingFeesUsd: z.string(),
});

export const PositionsDataSchema = z.array(PositionSchema);

// Order Schema
export const OrderSchema = z.object({
  key: z.string(),
  account: z.string(),
  callbackContract: z.string(),
  initialCollateralTokenAddress: z.string(),
  marketAddress: z.string(),
  decreasePositionSwapType: DecreasePositionSwapTypeSchema,
  receiver: z.string(),
  swapPath: z.array(z.string()),
  contractAcceptablePrice: z.string(),
  contractTriggerPrice: z.string(),
  callbackGasLimit: z.string(),
  executionFee: z.string(),
  initialCollateralDeltaAmount: z.string(),
  minOutputAmount: z.string(),
  sizeDeltaUsd: z.string(),
  updatedAtTime: z.string(),
  isFrozen: z.boolean(),
  isLong: z.boolean(),
  orderType: OrderTypeSchema,
  shouldUnwrapNativeToken: z.boolean(),
  autoCancel: z.boolean(),
  data: z.string(),
  uiFeeReceiver: z.string(),
  validFromTime: z.string(),
  title: z.string().optional(),
});

export const OrdersDataSchema = z.array(OrderSchema);

export const CreatePerpetualsPositionRequestSchema = z.object({
  amount: z.object({
    type: z.enum(["payAmount", "sizeAmount"]),
    value: z.coerce.bigint(),
  }),
  marketAddress: z.string(),
  payTokenAddress: z.string(),
  collateralTokenAddress: z.string(),
  referralCode: z.string().optional(),
  limitPrice: z.coerce.bigint().optional(),
  walletAddress: z.string(),
});

export type CreatePerpetualsPositionRequest = z.infer<
  typeof CreatePerpetualsPositionRequestSchema
>;

export const CreatePerpetualsPositionResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
});
export type CreatePerpetualsPositionResponse = z.infer<
  typeof CreatePerpetualsPositionResponseSchema
>;

export const GetPerpetualsMarketsPositionsRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
});

export type GetPerpetualsMarketsPositionsRequest = z.infer<
  typeof GetPerpetualsMarketsPositionsRequestSchema
>;

export const GetPerpetualsMarketsPositionsResponseSchema = z.object({
  positions: PositionsDataSchema,
});

export type GetPerpetualsMarketsPositionsResponse = z.infer<
  typeof GetPerpetualsMarketsPositionsResponseSchema
>;

export const GetPerpetualsMarketsOrdersRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
});

export type GetPerpetualsMarketsOrdersRequest = z.infer<
  typeof GetPerpetualsMarketsOrdersRequestSchema
>;

export const GetPerpetualsMarketsOrdersResponseSchema = z.object({
  orders: OrdersDataSchema,
});

export type GetPerpetualsMarketsOrdersResponse = z.infer<
  typeof GetPerpetualsMarketsOrdersResponseSchema
>;

export const CancelPerpetualsOrdersRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  orderKeys: z
    .array(z.string())
    .describe("Array of order IDs (keys) to cancel"),
});

export type CancelPerpetualsOrdersRequest = z.infer<
  typeof CancelPerpetualsOrdersRequestSchema
>;

export const CancelPerpetualsOrdersResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
});

export type CancelPerpetualsOrdersResponse = z.infer<
  typeof CancelPerpetualsOrdersResponseSchema
>;

export const ClosePerpetualsPositionRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  marketAddress: z.string().describe("Market contract address"),
  collateralTokenAddress: z.string().describe("Collateral token address"),
  isLong: z
    .boolean()
    .describe("Position direction - true for long, false for short"),
  receiveTokenAddress: z
    .string()
    .describe(
      "Token address to receive (can be collateral token or another token for swapping)",
    ),
  allowedSlippageBps: z
    .number()
    .optional()
    .default(100)
    .describe("Allowed slippage in basis points (default: 100 = 1%)"),
});

export type ClosePerpetualsPositionRequest = z.infer<
  typeof ClosePerpetualsPositionRequestSchema
>;

export const ClosePerpetualsPositionResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
});

export type ClosePerpetualsPositionResponse = z.infer<
  typeof ClosePerpetualsPositionResponseSchema
>;

export const GetPerpetualsMarketsRequestSchema = z.object({
  chainIds: z.array(z.string()),
});

export type GetPerpetualsMarketsRequest = z.infer<
  typeof GetPerpetualsMarketsRequestSchema
>;

export const PerpetualMarketSchema = z.object({
  marketToken: TokenIdentifierSchema,
  indexToken: TokenIdentifierSchema,
  longToken: TokenIdentifierSchema,
  shortToken: TokenIdentifierSchema,
  name: z.string(),
});

export type PerpetualMarket = z.infer<typeof PerpetualMarketSchema>;

export const GetPerpetualsMarketsResponseSchema = z.object({
  markets: z.array(PerpetualMarketSchema),
});

export type GetPerpetualsMarketsResponse = z.infer<
  typeof GetPerpetualsMarketsResponseSchema
>;
