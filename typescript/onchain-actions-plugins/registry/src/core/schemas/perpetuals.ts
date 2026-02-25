import { z } from 'zod';

import { TransactionPlanSchema, TokenIdentifierSchema } from './core.js';

// Enums
export const DecreasePositionSwapTypeSchema = z.enum([
  'NoSwap',
  'SwapPnlTokenToCollateralToken',
  'SwapCollateralTokenToPnlToken',
]);
export type DecreasePositionSwapType = z.infer<typeof DecreasePositionSwapTypeSchema>;

export const PositionSideSchema = z.enum(['long', 'short']);

export type PositionSide = z.infer<typeof PositionSideSchema>;

// API Schemas and types
export const PositionSchema = z.object({
  chainId: z.string(),
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
  positionSide: PositionSideSchema,
  isLong: z.boolean(),
  fundingFeeAmount: z.string(),
  claimableLongTokenAmount: z.string(),
  claimableShortTokenAmount: z.string(),
  isOpening: z.boolean().optional(),
  pnl: z.string(),
  positionFeeAmount: z.string(),
  traderDiscountAmount: z.string(),
  uiFeeAmount: z.string(),
  data: z.string().optional(),
});

export type PerpetualsPosition = z.infer<typeof PositionSchema>;

export const PositionsDataSchema = z.array(PositionSchema);

export const OrderTypeSchema = z.enum([
  'MarketSwap',
  'LimitSwap',
  'MarketIncrease',
  'LimitIncrease',
  'MarketDecrease',
  'LimitDecrease',
  'StopLossDecrease',
  'Liquidation',
  'StopIncrease',
]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

// Order Schema
export const OrderSchema = z.object({
  chainId: z.string(),
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
  positionSide: PositionSideSchema,
  orderType: OrderTypeSchema,
  shouldUnwrapNativeToken: z.boolean(),
  autoCancel: z.boolean(),
  data: z.string().optional(),
  uiFeeReceiver: z.string(),
  validFromTime: z.string(),
  title: z.string().optional(),
});

export type PerpetualsOrder = z.infer<typeof OrderSchema>;

export const OrdersDataSchema = z.array(OrderSchema);

const BaseUnitAmountSchema = z.preprocess((value) => {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return value;
    }

    return BigInt(value);
  }

  if (typeof value === 'string') {
    if (!/^\d+$/u.test(value)) {
      return value;
    }

    return BigInt(value);
  }

  return value;
}, z.bigint());

const Base10IntegerStringSchema = z
  .string()
  .regex(/^\d+$/u, 'Must be a base-10 integer string');

// Definition for plugin with mapped entities already in place
export const CreatePerpetualsPositionRequestSchema = z.object({
  amount: BaseUnitAmountSchema,
  walletAddress: z.string(),
  chainId: z.string(),
  marketAddress: z.string(),
  payTokenAddress: z.string(),
  collateralTokenAddress: z.string(),
  referralCode: z.string().optional(),
  limitPrice: z.string().optional(),
  leverage: z.string(),
});

export type CreatePerpetualsPositionRequest = z.infer<typeof CreatePerpetualsPositionRequestSchema>;

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

export const CreatePerpetualsIncreaseQuoteRequestSchema = z.object({
  walletAddress: z.string(),
  providerName: z.string(),
  chainId: z.string(),
  marketAddress: z.string(),
  collateralTokenAddress: z.string(),
  side: PositionSideSchema,
  collateralDeltaAmount: Base10IntegerStringSchema,
  sizeDeltaUsd: Base10IntegerStringSchema,
  slippageBps: Base10IntegerStringSchema,
});
export type CreatePerpetualsIncreaseQuoteRequest = z.infer<
  typeof CreatePerpetualsIncreaseQuoteRequestSchema
>;

export const CreatePerpetualsIncreasePlanRequestSchema =
  CreatePerpetualsIncreaseQuoteRequestSchema;
export type CreatePerpetualsIncreasePlanRequest = z.infer<
  typeof CreatePerpetualsIncreasePlanRequestSchema
>;

const PerpetualDecreaseRequestBaseSchema = z.object({
  walletAddress: z.string(),
  providerName: z.string(),
  chainId: z.string(),
  marketAddress: z.string(),
  collateralTokenAddress: z.string(),
  side: PositionSideSchema,
});

const PerpetualDecreaseFullSchema = z.object({
  mode: z.literal('full'),
  slippageBps: Base10IntegerStringSchema,
});

const PerpetualDecreasePartialSchema = z.object({
  mode: z.literal('partial'),
  sizeDeltaUsd: Base10IntegerStringSchema,
  slippageBps: Base10IntegerStringSchema,
});

const PerpetualDecreaseSchema = z.discriminatedUnion('mode', [
  PerpetualDecreaseFullSchema,
  PerpetualDecreasePartialSchema,
]);

export const CreatePerpetualsDecreaseQuoteRequestSchema = PerpetualDecreaseRequestBaseSchema.extend({
  decrease: PerpetualDecreaseSchema,
});
export type CreatePerpetualsDecreaseQuoteRequest = z.infer<
  typeof CreatePerpetualsDecreaseQuoteRequestSchema
>;

export const CreatePerpetualsDecreasePlanRequestSchema =
  CreatePerpetualsDecreaseQuoteRequestSchema;
export type CreatePerpetualsDecreasePlanRequest = z.infer<
  typeof CreatePerpetualsDecreasePlanRequestSchema
>;

export const CreatePerpetualsOrderCancelPlanRequestSchema = z.object({
  walletAddress: z.string(),
  providerName: z.string(),
  chainId: z.string(),
  orderKey: z.string(),
});
export type CreatePerpetualsOrderCancelPlanRequest = z.infer<
  typeof CreatePerpetualsOrderCancelPlanRequestSchema
>;

export const GetPerpetualLifecycleRequestSchema = z.object({
  providerName: z.string(),
  chainId: z.string(),
  txHash: z.string(),
  orderKey: z.string().optional(),
  walletAddress: z.string().optional(),
});
export type GetPerpetualLifecycleRequest = z.infer<typeof GetPerpetualLifecycleRequestSchema>;

export const PerpetualNumericPrecisionSchema = z.object({
  tokenDecimals: z.number().int().nonnegative(),
  priceDecimals: z.number().int().nonnegative(),
  usdDecimals: z.number().int().nonnegative(),
});
export type PerpetualNumericPrecision = z.infer<typeof PerpetualNumericPrecisionSchema>;

export const PerpetualQuoteResponseSchema = z.object({
  asOf: z.string(),
  ttlMs: z.number().int().nonnegative(),
  precision: PerpetualNumericPrecisionSchema,
  pricing: z.object({
    markPrice: Base10IntegerStringSchema,
    acceptablePrice: Base10IntegerStringSchema,
    slippageBps: Base10IntegerStringSchema,
    priceImpactDeltaUsd: Base10IntegerStringSchema,
  }),
  fees: z.object({
    positionFeeUsd: Base10IntegerStringSchema,
    borrowingFeeUsd: Base10IntegerStringSchema,
    fundingFeeUsd: Base10IntegerStringSchema,
  }),
  warnings: z.array(z.string()),
});
export type PerpetualQuoteResponse = z.infer<typeof PerpetualQuoteResponseSchema>;

export const PerpetualPlanResponseSchema = z.object({
  asOf: z.string(),
  precision: PerpetualNumericPrecisionSchema,
  transactions: z.array(TransactionPlanSchema),
  normalizedValues: z.record(z.string(), Base10IntegerStringSchema),
});
export type PerpetualPlanResponse = z.infer<typeof PerpetualPlanResponseSchema>;

export const CreatePerpetualsIncreaseQuoteResponseSchema = PerpetualQuoteResponseSchema;
export type CreatePerpetualsIncreaseQuoteResponse = z.infer<
  typeof CreatePerpetualsIncreaseQuoteResponseSchema
>;

export const CreatePerpetualsIncreasePlanResponseSchema = PerpetualPlanResponseSchema;
export type CreatePerpetualsIncreasePlanResponse = z.infer<
  typeof CreatePerpetualsIncreasePlanResponseSchema
>;

export const CreatePerpetualsDecreaseQuoteResponseSchema = PerpetualQuoteResponseSchema;
export type CreatePerpetualsDecreaseQuoteResponse = z.infer<
  typeof CreatePerpetualsDecreaseQuoteResponseSchema
>;

export const CreatePerpetualsDecreasePlanResponseSchema = PerpetualPlanResponseSchema;
export type CreatePerpetualsDecreasePlanResponse = z.infer<
  typeof CreatePerpetualsDecreasePlanResponseSchema
>;

export const CreatePerpetualsOrderCancelPlanResponseSchema = PerpetualPlanResponseSchema;
export type CreatePerpetualsOrderCancelPlanResponse = z.infer<
  typeof CreatePerpetualsOrderCancelPlanResponseSchema
>;

export const SubmitPerpetualsTransactionRequestSchema = z.object({
  providerName: z.string(),
  chainId: z.string(),
  signedTx: z.string().regex(/^0x[0-9a-fA-F]+$/u),
});
export type SubmitPerpetualsTransactionRequest = z.infer<
  typeof SubmitPerpetualsTransactionRequestSchema
>;

export const SubmitPerpetualsTransactionResponseSchema = z.object({
  providerName: z.string(),
  chainId: z.string(),
  txHash: z.string(),
  orderKey: z.string().optional(),
  walletAddress: z.string().optional(),
  submittedAtBlock: z.string().optional(),
  asOf: z.string(),
});
export type SubmitPerpetualsTransactionResponse = z.infer<
  typeof SubmitPerpetualsTransactionResponseSchema
>;

const PerpetualLifecycleDisambiguationResponseSchema = z.object({
  providerName: z.string(),
  chainId: z.string(),
  txHash: z.string(),
  needsDisambiguation: z.literal(true),
  candidateOrderKeys: z.array(z.string()).min(1),
  asOf: z.string(),
});

const PerpetualLifecycleResolvedResponseSchema = z.object({
  providerName: z.string(),
  chainId: z.string(),
  txHash: z.string(),
  needsDisambiguation: z.literal(false).optional(),
  orderKey: z.string(),
  status: z.enum(['pending', 'executed', 'cancelled', 'failed', 'unknown']),
  reason: z.string().optional(),
  reasonBytes: z.string().optional(),
  requestedPrice: Base10IntegerStringSchema.optional(),
  observedPrice: Base10IntegerStringSchema.optional(),
  createTxHash: z.string().optional(),
  executionTxHash: z.string().optional(),
  cancellationTxHash: z.string().optional(),
  precision: PerpetualNumericPrecisionSchema,
  asOf: z.string(),
});

export const GetPerpetualLifecycleResponseSchema = z.union([
  PerpetualLifecycleDisambiguationResponseSchema,
  PerpetualLifecycleResolvedResponseSchema,
]);
export type GetPerpetualLifecycleResponse = z.infer<typeof GetPerpetualLifecycleResponseSchema>;

export const GetPerpetualsMarketsRequestSchema = z.object({
  chainIds: z.array(z.string()),
});

export type GetPerpetualsMarketsRequest = z.infer<typeof GetPerpetualsMarketsRequestSchema>;

export const PerpetualMarketSchema = z.object({
  marketToken: TokenIdentifierSchema,
  indexToken: TokenIdentifierSchema,
  longToken: TokenIdentifierSchema,
  shortToken: TokenIdentifierSchema,
  longFundingFee: z.string(),
  shortFundingFee: z.string(),
  longBorrowingFee: z.string(),
  shortBorrowingFee: z.string(),
  chainId: z.string(),
  name: z.string(),
});

export type PerpetualMarket = z.infer<typeof PerpetualMarketSchema>;

export const GetPerpetualsMarketsResponseSchema = z.object({
  markets: z.array(PerpetualMarketSchema),
});

export type GetPerpetualsMarketsResponse = z.infer<typeof GetPerpetualsMarketsResponseSchema>;
