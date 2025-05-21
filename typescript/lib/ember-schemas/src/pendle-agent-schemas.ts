import { z } from 'zod';

// Original TokenIdentifierSchema from pendle-agent
export const TokenIdentifierSchema = z.object({
  chainId: z.string().describe('The chain ID of the token identifier.'),
  address: z.string().describe('The address of the token identifier.'),
});
export type TokenIdentifier = z.infer<typeof TokenIdentifierSchema>;

// Original TokenSchema from pendle-agent, renamed to PendleAgentTokenSchema
export const PendleAgentTokenSchema = z.object({
  tokenUid: TokenIdentifierSchema.describe('For native tokens, this may be empty.').optional(),
  name: z.string().describe('The human-readable name of the token.'),
  symbol: z.string().describe('The ticker symbol of the token.'),
  isNative: z.boolean().describe('Whether this token is native to its chain.'),
  decimals: z.number().int().describe('The number of decimal places the token uses.'),
  iconUri: z.string().optional().describe('Optional URI for the token icon.'),
  usdPrice: z
    .string()
    .optional()
    .describe(
      'Optional USD price as a string to avoid floating-point precision issues, e.g., "123.456789".'
    ),
  isVetted: z.boolean().describe('Whether the token has been vetted.'),
});
export type PendleAgentToken = z.infer<typeof PendleAgentTokenSchema>;

export const GetPendleMarketsRequestSchema = z.object({});
export type GetPendleMarketsRequestArgs = z.infer<typeof GetPendleMarketsRequestSchema>;

export const YieldMarketSchema = z.object({
  name: z.string().describe('The name of the yield market.'),
  address: z.string().describe('The address of the yield market.'),
  expiry: z.string().describe('The expiry identifier of the yield market.'),
  pt: z.string().describe('The address of the PT (principal token).'),
  yt: z.string().describe('The address of the YT (yield token).'),
  sy: z.string().describe('The address of the SY (standardized yield token).'),
  underlyingAsset: PendleAgentTokenSchema.describe('The underlying asset of the Pendle market.'), // Adjusted to use PendleAgentTokenSchema
  chainId: z.string().describe('The chain ID on which this yield market exists.'),
});
export type YieldMarket = z.infer<typeof YieldMarketSchema>;

export const GetYieldMarketsResponseSchema = z.object({
  markets: z
    .array(YieldMarketSchema)
    .describe('List of yield markets matching the request criteria.'),
});
export type GetYieldMarketsResponse = z.infer<typeof GetYieldMarketsResponseSchema>;

// Removed SwapTokensSchema and SwapTokensArgs from here
// They will be imported from the unified version in swapping-agent-schemas.ts (via ember-schemas index) 