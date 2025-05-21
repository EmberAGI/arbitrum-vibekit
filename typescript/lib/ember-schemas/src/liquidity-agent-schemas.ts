import { z } from 'zod';
import { TokenUidSchema } from './token.js'; // General TokenUID schema

// Schemas moved from liquidity-agent-no-wallet

// Replaces EmberLiquidityPoolSchema
export const LiquidityPoolSchema = z.object({
  symbol0: z.string(),
  symbol1: z.string(),
  token0: TokenUidSchema, // Using imported TokenUidSchema
  token1: TokenUidSchema, // Using imported TokenUidSchema
  price: z.string(),
  providerId: z.string().optional(),
});
// .passthrough() removed
export type LiquidityPool = z.infer<typeof LiquidityPoolSchema>;

// Replaces GetLiquidityPoolsResponseSchema
export const GetLiquidityPoolsAgentResponseSchema = z.object({
  liquidityPools: z.array(LiquidityPoolSchema),
});
// .passthrough() removed
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
      'The index number (starting from 1) of the liquidity position to withdraw, as listed by getUserLiquidityPositions.'
    ),
});
export type WithdrawLiquidityArgs = z.infer<typeof WithdrawLiquiditySchema>;

export const GetLiquidityPoolsToolSchema = z.object({}); // For the tool parameter
export type GetLiquidityPoolsToolArgs = z.infer<typeof GetLiquidityPoolsToolSchema>;

export const GetUserLiquidityPositionsToolSchema = z.object({}); // For the tool parameter
export type GetUserLiquidityPositionsToolArgs = z.infer<typeof GetUserLiquidityPositionsToolSchema>; 