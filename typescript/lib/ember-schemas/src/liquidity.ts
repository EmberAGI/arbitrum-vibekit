import { z } from 'zod';

import { 
  createTransactionArtifactSchema, 
  type TransactionArtifact,
  TokenIdentifierSchema,
} from './common.js';

export const LiquidityPoolSchema = z.object({
  symbol0: z.string(),
  symbol1: z.string(),
  token0: TokenIdentifierSchema,
  token1: TokenIdentifierSchema,
  price: z.string(),
  providerId: z.string().optional(),
});
export type LiquidityPool = z.infer<typeof LiquidityPoolSchema>;

export const GetLiquidityPoolsAgentResponseSchema = z.object({
  liquidityPools: z.array(LiquidityPoolSchema),
});
export type GetLiquidityPoolsAgentResponse = z.infer<typeof GetLiquidityPoolsAgentResponseSchema>;

// Schemas for agent tool parameters
export const SupplyLiquiditySchema = z.object({
  pair: z
    .string()
    .describe(
      'The handle for the liquidity pair (e.g., WETH/USDC). Enum will be populated dynamically.'
    ),
  amount0: z.string().describe('The amount of the first token to supply (human-readable format).'),
  amount1: z.string().describe('The amount of the second token to supply (human-readable format).'),
  priceFrom: z
    .string()
    .describe('The lower bound price for the liquidity range (human-readable format).'),
  priceTo: z
    .string()
    .describe('The upper bound price for the liquidity range (human-readable format).'),
});
export type SupplyLiquidityArgs = z.infer<typeof SupplyLiquiditySchema>;

export const WithdrawLiquiditySchema = z.object({
  positionNumber: z
    .number()
    .int()
    .positive()
    .describe(
      'The index number (starting from 1) of the liquidity position to withdraw, as listed by getWalletLiquidityPositions.'
    ),
});
export type WithdrawLiquidityArgs = z.infer<typeof WithdrawLiquiditySchema>;

export const GetLiquidityPoolsSchema = z.object({}); 
export type GetLiquidityPoolsArgs = z.infer<typeof GetLiquidityPoolsSchema>;

export const GetWalletLiquidityPositionsSchema = z.object({});
export type GetWalletLiquidityPositionsArgs = z.infer<typeof GetWalletLiquidityPositionsSchema>;

//
// Liquidity Preview and Artifact Schemas
//

export const LiquidityPreviewSchema = z.object({
  action: z.enum(['supply', 'withdraw']),
  pairHandle: z.string().optional(),
  token0Symbol: z.string(),
  token0Amount: z.string(),
  token1Symbol: z.string(),
  token1Amount: z.string(),
  priceFrom: z.string().optional(),
  priceTo: z.string().optional(),
  positionNumber: z.number().optional(),
});
export type LiquidityPreview = z.infer<typeof LiquidityPreviewSchema>;

export const LiquidityArtifactSchema = createTransactionArtifactSchema(LiquidityPreviewSchema);
export type LiquidityTransactionArtifact = TransactionArtifact<LiquidityPreview>;

export const LiquidityPairArtifactSchema = z.object({
  handle: z.string(),
  symbol0: z.string(),
  symbol1: z.string(),
  token0: TokenIdentifierSchema,
  token1: TokenIdentifierSchema,
  price: z.string(),
});
export type LiquidityPairArtifact = z.infer<typeof LiquidityPairArtifactSchema>;

export const LiquidityPoolsArtifactSchema = z.object({
  pools: z.array(LiquidityPairArtifactSchema),
});
export type LiquidityPoolsArtifact = z.infer<typeof LiquidityPoolsArtifactSchema>;

// Position-related schemas
export const PositionRangeSchema = z.object({
  fromPrice: z.string(),
  toPrice: z.string(),
});
export type PositionRange = z.infer<typeof PositionRangeSchema>;

export const LiquidityPositionArtifactSchema = z.object({
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
  price: z.string(),
  providerId: z.string(),
  positionRange: PositionRangeSchema,
});
export type LiquidityPositionArtifact = z.infer<typeof LiquidityPositionArtifactSchema>;

export const UserPositionsArtifactSchema = z.object({
  positions: z.array(LiquidityPositionArtifactSchema),
});
export type UserPositionsArtifact = z.infer<typeof UserPositionsArtifactSchema>;

export const GetWalletLiquidityPositionsResponseSchema = z.object({
  positions: z.array(LiquidityPositionArtifactSchema),
});
export type GetWalletLiquidityPositionsResponse = z.infer<typeof GetWalletLiquidityPositionsResponseSchema>; 