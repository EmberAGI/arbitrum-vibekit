import { z } from 'zod';

import { TokenIdentifierSchema, TokenSchema } from '../core/schemas/core.js';
import {
  LiquidityPositionRangeSchema,
  LiquidityProvisionRangeSchema,
  LiquidityRewardsOwedTokenSchema,
} from '../core/schemas/liquidity.js';

import {
  PaginatedPossibleResultsRequestSchema,
  PaginatedPossibleResultsResponseSchema,
} from './pagination.js';

export const NonMappedPayableTokens = z.object({
  token: z.string().describe('The token to be paid'),
  amount: z.string().describe('The amount of the token to be paid as a string'),
});

export const CreateLiquiditySupplyRequestSchema = z.object({
  walletAddress: z.string().describe('The wallet address that will supply liquidity to the pool'),
  payableTokens: z
    .array(NonMappedPayableTokens)
    .describe('The tokens and amounts to be supplied to the liquidity pool'),
  poolToken: z.string().describe('The liquidity pool token'),
  supplyChain: z
    .string()
    .describe('The blockchain network where the liquidity pool exists'),
  range: LiquidityProvisionRangeSchema.describe(
    'The price range for concentrated liquidity provision',
  ).optional(),
});
export type CreateLiquiditySupplyRequest = z.infer<typeof CreateLiquiditySupplyRequestSchema>;

export const CreateLiquiditySupplyPayableTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema.describe('The token to be paid'),
  amount: z.string().describe('The amount of the token to be paid as a string'),
});

export const CreateLiquiditySupplyEndpointRequestSchema = CreateLiquiditySupplyRequestSchema.omit({
  payableTokens: true,
  poolToken: true,
}).extend({
  payableTokens: z
    .array(CreateLiquiditySupplyPayableTokenSchema)
    .describe('The tokens and amounts to be supplied to the liquidity pool'),
  poolIdentifier: TokenIdentifierSchema.describe('The liquidity pool token'),
});

export const CreateLiquidityWithdrawRequestSchema = z.object({
  walletAddress: z
    .string()
    .describe('The wallet address that owns the liquidity position to withdraw'),
  poolToken: z.string().describe('The LP token representing the liquidity position'),
});
export type CreateLiquidityWithdrawRequest = z.infer<typeof CreateLiquidityWithdrawRequestSchema>;

export const PromptLiquidityWithdrawRequestSchema =
  CreateLiquidityWithdrawRequestSchema.partial();

export const PossibleLiquidityWithdrawRequestSchema = PaginatedPossibleResultsRequestSchema.merge(
  PromptLiquidityWithdrawRequestSchema,
);
export type PossibleLiquidityWithdrawRequest = z.infer<
  typeof PossibleLiquidityWithdrawRequestSchema
>;

export const LiquidityWithdrawOptionSchema = z.object({
  createRequest: CreateLiquidityWithdrawRequestSchema.pick({
    walletAddress: true,
    poolToken: true,
  }),
  data: z.object({}),
});
export type LiquidityWithdrawOption = z.infer<typeof LiquidityWithdrawOptionSchema>;

export const PossibleLiquidityWithdrawResponseSchema = PaginatedPossibleResultsResponseSchema.extend(
  {
    options: z
      .array(LiquidityWithdrawOptionSchema)
      .describe('Available liquidity positions that can be withdrawn'),
  },
);

export const CreateLiquidityWithdrawEndpointRequestSchema = z.object({
  walletAddress: z
    .string()
    .describe('The wallet owning the liquidity position to withdraw'),
  poolTokenUid: TokenIdentifierSchema.describe('The LP token identifier'),
});

export const LiquidityPositionPooledTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int(),
  amount: z.string(),
  usdPrice: z.string().optional(),
  valueUsd: z.string().optional(),
});
export type LiquidityPositionPooledToken = z.infer<
  typeof LiquidityPositionPooledTokenSchema
>;

export const LiquidityPositionFeesOwedTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int(),
  amount: z.string(),
  usdPrice: z.string().optional(),
  valueUsd: z.string().optional(),
});
export type LiquidityPositionFeesOwedToken = z.infer<
  typeof LiquidityPositionFeesOwedTokenSchema
>;

export const LiquidityPositionSchema = z.object({
  positionId: z.string(),
  poolIdentifier: TokenIdentifierSchema,
  operator: z.string(),
  pooledTokens: z.array(LiquidityPositionPooledTokenSchema),
  feesOwedTokens: z.array(LiquidityPositionFeesOwedTokenSchema),
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
  poolName: z.string(),
});
export type LiquidityPosition = z.infer<typeof LiquidityPositionSchema>;

export const GetWalletLiquidityPositionsResponseSchema = z.object({
  positions: z.array(LiquidityPositionSchema),
});
export type GetWalletLiquidityPositionsResponse = z.infer<
  typeof GetWalletLiquidityPositionsResponseSchema
>;

export const LiquidityPoolSchema = z.object({
  identifier: TokenIdentifierSchema,
  tokens: z.array(TokenSchema),
  currentPrice: z.string(),
  providerId: z.string(),
  feeTierBps: z.number().int().optional(),
  liquidity: z.string().optional(),
  tvlUsd: z.string().optional(),
  volume24hUsd: z.string().optional(),
  tickSpacing: z.number().int().optional(),
  currentTick: z.number().int().optional(),
  poolName: z.string(),
});
export type LiquidityPool = z.infer<typeof LiquidityPoolSchema>;

export const GetLiquidityPoolsResponseSchema = z.object({
  liquidityPools: z.array(LiquidityPoolSchema),
});
export type GetLiquidityPoolsResponse = z.infer<typeof GetLiquidityPoolsResponseSchema>;
