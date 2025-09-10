import { z } from 'zod';
import { ChainSchema, TokenSchema } from './core.js';
import { CapabilitySchema } from './capabilities.js';
import { CapabilityTypeSchema } from './enums.js';

export const GetChainsRequestSchema = z.object({
  filter: z.string(),
});
export type GetChainsRequest = z.infer<typeof GetChainsRequestSchema>;

export const GetChainsResponseSchema = z.object({
  chains: z.array(ChainSchema),
});
export type GetChainsResponse = z.infer<typeof GetChainsResponseSchema>;

export const GetTokensRequestSchema = z.object({
  chainIds: z.array(z.string()).optional(),
});
export type GetTokensRequest = z.infer<typeof GetTokensRequestSchema>;

export const GetTokensResponseSchema = z.object({
  tokens: z.array(TokenSchema),
});
export type GetTokensResponse = z.infer<typeof GetTokensResponseSchema>;

export const GetCapabilitiesRequestSchema = z.object({
  type: CapabilityTypeSchema,
});
export type GetCapabilitiesRequest = z.infer<typeof GetCapabilitiesRequestSchema>;

export const GetCapabilitiesResponseSchema = z.object({
  capabilities: z.array(CapabilitySchema),
});
export type GetCapabilitiesResponse = z.infer<typeof GetCapabilitiesResponseSchema>;
