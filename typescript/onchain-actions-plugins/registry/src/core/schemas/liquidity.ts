import { z } from 'zod';

import { TokenIdentifierSchema, TokenSchema, TransactionPlanSchema } from './core.js';

export const LiquidityProvisionRangeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('full'),
  }),
  z.object({
    type: z.literal('limited'),
    minPrice: z.string(),
    maxPrice: z.string(),
  }),
]);
export type LiquidityProvisionRange = z.infer<typeof LiquidityProvisionRangeSchema>;

export const LiquidityPositionRangeSchema = z.object({
  fromPrice: z.string(),
  toPrice: z.string(),
});
export type LiquidityPositionRange = z.infer<typeof LiquidityPositionRangeSchema>;

export const LiquidityRewardsOwedTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  usdPrice: z.string().optional(),
  valueUsd: z.string().optional(),
  source: z.string(),
});
export type LiquidityRewardsOwedToken = z.infer<typeof LiquidityRewardsOwedTokenSchema>;

export const LiquidityPooledTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int(),
  amount: z.string(),
  usdPrice: z.string().optional(),
  valueUsd: z.string().optional(),
});
export type LiquidityPooledToken = z.infer<typeof LiquidityPooledTokenSchema>;

export const LiquidityFeesOwedTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int(),
  amount: z.string(),
  usdPrice: z.string().optional(),
  valueUsd: z.string().optional(),
});
export type LiquidityFeesOwedToken = z.infer<typeof LiquidityFeesOwedTokenSchema>;

export const LiquidityPositionSchema = z.object({
  positionId: z.string(),
  poolIdentifier: TokenIdentifierSchema,
  operator: z.string(),
  pooledTokens: z.array(LiquidityPooledTokenSchema),
  feesOwedTokens: z.array(LiquidityFeesOwedTokenSchema),
  rewardsOwedTokens: z.array(LiquidityRewardsOwedTokenSchema),
  feesValueUsd: z.string().optional(),
  rewardsValueUsd: z.string().optional(),
  positionValueUsd: z.string().optional(),
  currentPrice: z.string().optional(),
  currentTick: z.number().int().optional(),
  tickLower: z.number().int().optional(),
  tickUpper: z.number().int().optional(),
  inRange: z.boolean().optional(),
  apr: z.string().optional(),
  apy: z.string().optional(),
  poolFeeBps: z.number().int().optional(),
  providerId: z.string(),
  positionRange: LiquidityPositionRangeSchema.optional(),
});
export type LiquidityPosition = z.infer<typeof LiquidityPositionSchema>;

export const LiquidityPoolTokens = z.object({
  tokenUid: TokenIdentifierSchema,
});
export type LiquidityPoolTokens = z.infer<typeof LiquidityPoolTokens>;

export const LiquidityPoolSchema = z.object({
  identifier: TokenIdentifierSchema,
  tokens: z.array(LiquidityPoolTokens),
  currentPrice: z.string(),
  providerId: z.string(),
  feeTierBps: z.number().int().optional(),
  liquidity: z.string().optional(),
  tvlUsd: z.string().optional(),
  volume24hUsd: z.string().optional(),
  tickSpacing: z.number().int().optional(),
});
export type LiquidityPool = z.infer<typeof LiquidityPoolSchema>;

export const LiquidityPayTokensSchema = z.object({
  token: TokenSchema,
  supplyAmount: z.bigint(),
});
export type LiquidityPayTokens = z.infer<typeof LiquidityPayTokensSchema>;

export const SupplyLiquidityRequestSchema = z.object({
  walletAddress: z.string(),
  poolToken: TokenSchema,
  payTokens: z.array(LiquidityPayTokensSchema),
  range: LiquidityProvisionRangeSchema.optional(),
});
export type SupplyLiquidityRequest = z.infer<typeof SupplyLiquidityRequestSchema>;

export const SupplyLiquidityResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
  poolIdentifier: TokenIdentifierSchema,
});
export type SupplyLiquidityResponse = z.infer<typeof SupplyLiquidityResponseSchema>;

export const WithdrawLiquidityRequestSchema = z.object({
  poolToken: TokenSchema,
  walletAddress: z.string(),
});
export type WithdrawLiquidityRequest = z.infer<typeof WithdrawLiquidityRequestSchema>;

export const WithdrawLiquidityResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type WithdrawLiquidityResponse = z.infer<typeof WithdrawLiquidityResponseSchema>;

export const GetWalletLiquidityPositionsRequestSchema = z.object({
  walletAddress: z.string(),
  includePrices: z.boolean().optional(),
  positionIds: z.array(z.string()).optional(),
});
export type GetWalletLiquidityPositionsRequest = z.infer<
  typeof GetWalletLiquidityPositionsRequestSchema
>;

export const GetWalletLiquidityPositionsResponseSchema = z.object({
  positions: z.array(LiquidityPositionSchema),
});
export type GetWalletLiquidityPositionsResponse = z.infer<
  typeof GetWalletLiquidityPositionsResponseSchema
>;

export const GetLiquidityPoolsResponseSchema = z.object({
  liquidityPools: z.array(LiquidityPoolSchema),
});
export type GetLiquidityPoolsResponse = z.infer<typeof GetLiquidityPoolsResponseSchema>;
