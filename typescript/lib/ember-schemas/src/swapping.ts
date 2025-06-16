import { z } from 'zod';

import { TokenIdentifierSchema, TransactionPlanSchema, AskEncyclopediaSchema, type AskEncyclopediaArgs } from './core.js';

//
// Swapping Tool Schemas
//

export const SwapTokensSchema = z.object({
  fromToken: z
    .string()
    .describe('The symbol or address of the token to swap from.'),
  toToken: z
    .string()
    .describe('The symbol or address of the token to swap to.'),
  amount: z
    .string()
    .describe('The human-readable amount of the token to swap from.'),
  fromChain: z.string().optional().describe('Optional chain name/ID for the source token.'),
  toChain: z.string().optional().describe('Optional chain name/ID for the destination token.'),
});
export type SwapTokensArgs = z.infer<typeof SwapTokensSchema>;

// Re-export AskEncyclopediaSchema for users of this module
export { AskEncyclopediaSchema };
export type { AskEncyclopediaArgs };

//
// Swapping Capability Schemas
//

export const CapabilityTokenSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  decimals: z.number().optional(),
  tokenUid: TokenIdentifierSchema.optional(),
});
export type CapabilityToken = z.infer<typeof CapabilityTokenSchema>;

export const CapabilitySchema = z.object({
  protocol: z.string().optional(),
  capabilityId: z.string().optional(),
  supportedTokens: z.array(CapabilityTokenSchema).optional(),
});
export type Capability = z.infer<typeof CapabilitySchema>;

export const SingleCapabilityEntrySchema = z.object({
  swapCapability: CapabilitySchema.optional(),
});
export type SingleCapabilityEntry = z.infer<typeof SingleCapabilityEntrySchema>;

export const GetCapabilitiesResponseSchema = z.object({
  capabilities: z.array(SingleCapabilityEntrySchema),
});
export type GetCapabilitiesResponse = z.infer<typeof GetCapabilitiesResponseSchema>;

//
// Swapping Transaction Schemas
//

export const EstimationSchema = z.object({
  effectivePrice: z.string(),
  timeEstimate: z.string(),
  expiration: z.string(),
  baseTokenDelta: z.string(),
  quoteTokenDelta: z.string(),
});
export type Estimation = z.infer<typeof EstimationSchema>;

export const ProviderTrackingSchema = z.object({
  requestId: z.string().optional(),
  providerName: z.string().optional(),
  explorerUrl: z.string(),
});
export type ProviderTracking = z.infer<typeof ProviderTrackingSchema>;

export const SwapResponseSchema = z.object({
  baseToken: TokenIdentifierSchema,
  quoteToken: TokenIdentifierSchema,
  estimation: EstimationSchema,
  providerTracking: ProviderTrackingSchema,
  transactions: z.array(TransactionPlanSchema),
});
export type SwapResponse = z.infer<typeof SwapResponseSchema>;

export const SwapPreviewSchema = z.object({
  fromTokenSymbol: z.string(),
  fromTokenAddress: z.string(),
  fromTokenAmount: z.string(),
  fromChain: z.string(),
  toTokenSymbol: z.string(),
  toTokenAddress: z.string(),
  toTokenAmount: z.string(),
  toChain: z.string(),
  exchangeRate: z.string(),
  executionTime: z.string(),
  expiration: z.string(),
  explorerUrl: z.string(),
});
export type SwapPreview = z.infer<typeof SwapPreviewSchema>; 