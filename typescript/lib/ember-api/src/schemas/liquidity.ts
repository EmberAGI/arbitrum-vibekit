import { z } from "zod";
import { TokenIdentifierSchema, TransactionPlanSchema } from "./core.js";

export const LimitedLiquidityProvisionRangeSchema = z.object({
  minPrice: z.string(),
  maxPrice: z.string(),
});
export type LimitedLiquidityProvisionRange = z.infer<
  typeof LimitedLiquidityProvisionRangeSchema
>;

export const LiquidityPositionRangeSchema = z.object({
  fromPrice: z.string(),
  toPrice: z.string(),
});
export type LiquidityPositionRange = z.infer<
  typeof LiquidityPositionRangeSchema
>;

export const LiquidityPositionSchema = z.object({
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
  positionRange: LiquidityPositionRangeSchema.optional(),
});
export type LiquidityPosition = z.infer<typeof LiquidityPositionSchema>;

export const LiquidityPoolSchema = z.object({
  token0: TokenIdentifierSchema,
  token1: TokenIdentifierSchema,
  symbol0: z.string(),
  symbol1: z.string(),
  price: z.string(),
  providerId: z.string(),
});
export type LiquidityPool = z.infer<typeof LiquidityPoolSchema>;

export const SupplyLiquidityRequestSchema = z.object({
  token0: TokenIdentifierSchema,
  token1: TokenIdentifierSchema,
  amount0: z.string(),
  amount1: z.string(),
  fullRange: z.boolean().optional(),
  limitedRange: LimitedLiquidityProvisionRangeSchema.optional(),
  supplierAddress: z.string(),
});
export type SupplyLiquidityRequest = z.infer<
  typeof SupplyLiquidityRequestSchema
>;

export const SupplyLiquidityResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type SupplyLiquidityResponse = z.infer<
  typeof SupplyLiquidityResponseSchema
>;

export const WithdrawLiquidityRequestSchema = z.object({
  tokenId: z.string(),
  providerId: z.string(),
  supplierAddress: z.string(),
});
export type WithdrawLiquidityRequest = z.infer<
  typeof WithdrawLiquidityRequestSchema
>;

export const WithdrawLiquidityResponseSchema = z.object({
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type WithdrawLiquidityResponse = z.infer<
  typeof WithdrawLiquidityResponseSchema
>;

export const GetUserLiquidityPositionsRequestSchema = z.object({
  supplierAddress: z.string(),
});
export type GetUserLiquidityPositionsRequest = z.infer<
  typeof GetUserLiquidityPositionsRequestSchema
>;

export const GetUserLiquidityPositionsResponseSchema = z.object({
  positions: z.array(LiquidityPositionSchema),
});
export type GetUserLiquidityPositionsResponse = z.infer<
  typeof GetUserLiquidityPositionsResponseSchema
>;

export const GetLiquidityPoolsResponseSchema = z.object({
  liquidityPools: z.array(LiquidityPoolSchema),
});
export type GetLiquidityPoolsResponse = z.infer<
  typeof GetLiquidityPoolsResponseSchema
>;
