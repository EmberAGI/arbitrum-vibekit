import { z } from 'zod';

import { TokenIdentifierSchema, TransactionPlanSchema } from './core.js';

export const LimitedLiquidityProvisionRangeSchema = z.object({
  minPrice: z.string(),
  maxPrice: z.string(),
});
export type LimitedLiquidityProvisionRange = z.infer<typeof LimitedLiquidityProvisionRangeSchema>;

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
  amount: z.string(),
  usdPrice: z.string().optional(),
  valueUsd: z.string().optional(),
});
export type LiquidityPooledToken = z.infer<typeof LiquidityPooledTokenSchema>;

export const LiquidityFeesOwedTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  usdPrice: z.string().optional(),
  valueUsd: z.string().optional(),
});
export type LiquidityFeesOwedToken = z.infer<typeof LiquidityFeesOwedTokenSchema>;

export const LiquidityPositionSchema = z.object({
  positionId: z.string(),
  tokenId: z.string(),
  poolAddress: z.string(),
  operator: z.string(),
  token0: TokenIdentifierSchema,
  token1: TokenIdentifierSchema,
  tokensOwed0: z.string(),
  tokensOwed1: z.string(),
  amount0: z.string(),
  amount1: z.string(),
  symbol0: z.string(),
  symbol1: z.string(),
  pooledTokens: z.array(LiquidityPooledTokenSchema),
  feesOwedTokens: z.array(LiquidityFeesOwedTokenSchema),
  rewardsOwedTokens: z.array(LiquidityRewardsOwedTokenSchema),
  feesValueUsd: z.string().optional(),
  rewardsValueUsd: z.string().optional(),
  positionValueUsd: z.string().optional(),
  price: z.string(),
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

export const LiquidityPoolSchema = z.object({
  token0: TokenIdentifierSchema,
  token1: TokenIdentifierSchema,
  symbol0: z.string(),
  symbol1: z.string(),
  currentPrice: z.string(),
  providerId: z.string(),
  feeTierBps: z.number().int().optional(),
  liquidity: z.string().optional(),
  tvlUsd: z.string().optional(),
  volume24hUsd: z.string().optional(),
});
export type LiquidityPool = z.infer<typeof LiquidityPoolSchema>;

export const SupplyLiquidityRequestSchema = z.object({
  token0: TokenIdentifierSchema,
  token1: TokenIdentifierSchema,
  amount0: z.string(),
  amount1: z.string(),
  range: LiquidityProvisionRangeSchema,
  walletAddress: z.string(),
});
export type SupplyLiquidityRequest = z.infer<typeof SupplyLiquidityRequestSchema>;

export const SupplyLiquidityResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type SupplyLiquidityResponse = z.infer<typeof SupplyLiquidityResponseSchema>;

export const WithdrawLiquidityRequestSchema = z.object({
  tokenId: z.string(),
  providerId: z.string(),
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
