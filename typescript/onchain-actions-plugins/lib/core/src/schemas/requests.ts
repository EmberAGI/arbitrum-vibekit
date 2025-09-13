import { z } from 'zod';
import { ChainSchema, TokenSchema } from './core.js';

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
