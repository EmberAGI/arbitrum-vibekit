import { z } from 'zod';

import { TokenIdentifierSchema } from '../core/schemas/core.js';

import {
  PaginatedPossibleResultsRequestSchema,
  PaginatedPossibleResultsResponseSchema,
} from './pagination.js';

export const AmountTypeSchema = z.union([
  z
    .literal('exactIn')
    .describe('Specify exact input amount - you know how much you want to spend'),
  z
    .literal('exactOut')
    .describe('Specify exact output amount - you know how much you want to receive'),
]);

export const CreateSwapRequestSchema = z.object({
  walletAddress: z.string().describe('The wallet address that will perform the token swap'),
  amount: z
    .string()
    .describe(
      'The amount of tokens to swap (input amount for exactIn, output amount for exactOut)',
    ),
  amountType: AmountTypeSchema.describe(
    'Whether the amount represents input tokens (exactIn) or desired output tokens (exactOut)',
  ),
  toChain: z.string().describe('The destination blockchain network for the token swap'),
  fromChain: z.string().describe('The source blockchain network for the token swap'),
  fromToken: z.string().describe('The token to swap from (source token symbol or name)'),
  toToken: z.string().describe('The token to swap to (destination token symbol or name)'),
  slippageTolerance: z
    .string()
    .optional()
    .describe("Maximum acceptable slippage percentage (e.g., '0.5' for 0.5%)"),
  expiration: z.string().optional().describe('Transaction expiration time in seconds from now'),
});
export type CreateSwapRequest = z.infer<typeof CreateSwapRequestSchema>;

export const PromptSwapRequestSchema = CreateSwapRequestSchema.pick({
  walletAddress: true,
  fromToken: true,
  toToken: true,
  fromChain: true,
  toChain: true,
}).partial();

export const PossibleSwapsRequestSchema = PaginatedPossibleResultsRequestSchema.merge(
  PromptSwapRequestSchema,
);
export type PossibleSwapsRequest = z.infer<typeof PossibleSwapsRequestSchema>;

export const PossibleSwapOptionSchema = z.object({
  createRequest: CreateSwapRequestSchema.pick({
    fromToken: true,
    fromChain: true,
    toToken: true,
    toChain: true,
  }),
  data: z.object({}).describe('Additional swap data (currently empty)'),
});
export type PossibleSwapOption = z.infer<typeof PossibleSwapOptionSchema>;

export const PossibleSwapsResponseSchema = PaginatedPossibleResultsResponseSchema.extend({
  options: z
    .array(PossibleSwapOptionSchema)
    .describe('Available token swap pairs across different blockchain networks'),
});

export const CreateSwapEndpointRequestSchema = CreateSwapRequestSchema.omit({
  fromToken: true,
  toToken: true,
  fromChain: true,
  toChain: true,
}).extend({
  fromTokenUid: TokenIdentifierSchema.describe(
    'Identifier (chainId + address) for the source token',
  ),
  toTokenUid: TokenIdentifierSchema.describe(
    'Identifier (chainId + address) for the destination token',
  ),
});
