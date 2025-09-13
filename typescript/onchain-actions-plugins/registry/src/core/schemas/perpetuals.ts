import { z } from 'zod';
import { TransactionPlanSchema, TokenIdentifierSchema } from './core.js';
import { DecreasePositionSwapType, OrderType } from '@gmx-io/sdk/types/orders';

// Enums
export const DecreasePositionSwapTypeSchema = z.nativeEnum(DecreasePositionSwapType);

export const PositionSideSchema = z.union([z.literal('long'), z.literal('short')]);

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
  orderType: z.nativeEnum(OrderType),
  shouldUnwrapNativeToken: z.boolean(),
  autoCancel: z.boolean(),
  data: z.string().optional(),
  uiFeeReceiver: z.string(),
  validFromTime: z.string(),
  title: z.string().optional(),
});

export type PerpetualsOrder = z.infer<typeof OrderSchema>;

export const OrdersDataSchema = z.array(OrderSchema);

// Definition for plugin with mapped entities already in place
export const CreatePerpetualsPositionRequestSchema = z.object({
  amount: z.bigint(),
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

export const ClosePerpetualsOrdersRequestSchema = z.object({
  walletAddress: z.string().describe("User's wallet address"),
  key: z.string(),
});

export type ClosePerpetualsOrdersRequest = z.infer<typeof ClosePerpetualsOrdersRequestSchema>;

export const ClosePerpetualsOrdersResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
});

export type ClosePerpetualsOrdersResponse = z.infer<typeof ClosePerpetualsOrdersResponseSchema>;

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
