import { z } from 'zod';
import { TokenIdentifierSchema, TokenSchema, TransactionPlanSchema } from './core.js';

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

export const LiquiditySuppliedTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  suppliedAmount: z.string(),
  owedTokens: z.string(),
});
export type LiquiditySuppliedToken = z.infer<typeof LiquiditySuppliedTokenSchema>;

export const LiquidityPositionSchema = z.object({
  poolIdentifier: TokenIdentifierSchema,
  operator: z.string(),
  suppliedTokens: z.array(LiquiditySuppliedTokenSchema),
  price: z.string(),
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
  price: z.string(),
  providerId: z.string(),
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
