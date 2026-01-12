import { z } from 'zod';

import { LiquidityProvisionRangeSchema } from '../core/schemas/liquidity.js';
import { TokenIdentifierSchema } from '../core/schemas/core.js';
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
