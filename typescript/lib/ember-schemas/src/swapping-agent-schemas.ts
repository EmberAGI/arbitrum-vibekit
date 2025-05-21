import { z } from 'zod';
import { TokenUidSchema } from './token.js'; // Assuming token.ts is in the same directory

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

export const AskEncyclopediaSchema = z.object({
  question: z.string().describe('The question to ask the encyclopedia or informational tool.'),
});
export type AskEncyclopediaArgs = z.infer<typeof AskEncyclopediaSchema>;

export const McpCapabilityTokenSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  decimals: z.number().optional(),
  tokenUid: TokenUidSchema.optional(), // Replaced inline object with imported TokenUidSchema
});
// .passthrough() removed
export type McpCapabilityToken = z.infer<typeof McpCapabilityTokenSchema>;

export const McpCapabilitySchema = z.object({
  protocol: z.string().optional(),
  capabilityId: z.string().optional(),
  supportedTokens: z.array(McpCapabilityTokenSchema).optional(),
});
// .passthrough() removed
export type McpCapability = z.infer<typeof McpCapabilitySchema>;

export const McpSingleCapabilityEntrySchema = z.object({
  swapCapability: McpCapabilitySchema.optional(),
});
// .passthrough() removed
export type McpSingleCapabilityEntry = z.infer<typeof McpSingleCapabilityEntrySchema>;

export const McpGetCapabilitiesResponseSchema = z.object({
  capabilities: z.array(McpSingleCapabilityEntrySchema),
});
export type McpGetCapabilitiesResponse = z.infer<typeof McpGetCapabilitiesResponseSchema>; 