import { z } from 'zod';

import { TokenIdentifierSchema } from './common.js';
import {
  TransactionPlanSchema,
  AskEncyclopediaSchema,
  type AskEncyclopediaArgs
} from './common.js';

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

export const McpCapabilityTokenSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  decimals: z.number().optional(),
  tokenUid: TokenIdentifierSchema.optional(),
});
export type McpCapabilityToken = z.infer<typeof McpCapabilityTokenSchema>;

export const McpCapabilitySchema = z.object({
  protocol: z.string().optional(),
  capabilityId: z.string().optional(),
  supportedTokens: z.array(McpCapabilityTokenSchema).optional(),
});
export type McpCapability = z.infer<typeof McpCapabilitySchema>;

export const McpSingleCapabilityEntrySchema = z.object({
  swapCapability: McpCapabilitySchema.optional(),
});
export type McpSingleCapabilityEntry = z.infer<typeof McpSingleCapabilityEntrySchema>;

export const McpGetCapabilitiesResponseSchema = z.object({
  capabilities: z.array(McpSingleCapabilityEntrySchema),
});
export type McpGetCapabilitiesResponse = z.infer<typeof McpGetCapabilitiesResponseSchema>;

//
// Swapping Transaction Schemas
//

// From swapping-agent-no-wallet
export const TokenDetailSchema = z.object({
  address: z.string(),
  chainId: z.string(),
});
export type TokenDetail = z.infer<typeof TokenDetailSchema>;

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
  baseToken: TokenDetailSchema,
  quoteToken: TokenDetailSchema,
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