import { z } from 'zod';

import { ChainSchema, TokenIdentifierSchema, TokenSchema } from '../core/schemas/core.js';

export const GetChainsRequestSchema = z.object({});
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

export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  website: z.string().optional(),
  x: z.string().optional(),
  type: z.string(),
});
export type Provider = z.infer<typeof ProviderSchema>;

export const GetProvidersRequestSchema = z.object({});
export type GetProvidersRequest = z.infer<typeof GetProvidersRequestSchema>;

export const GetProvidersResponseSchema = z.object({
  providers: z.array(ProviderSchema),
});
export type GetProvidersResponse = z.infer<typeof GetProvidersResponseSchema>;

export const BalanceSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  symbol: z.string().optional(),
  valueUsd: z.number().optional(),
  decimals: z.number().int().optional(),
});
export type Balance = z.infer<typeof BalanceSchema>;

export const GetWalletBalancesRequestSchema = z.object({
  walletAddress: z.string(),
});
export type GetWalletBalancesRequest = z.infer<typeof GetWalletBalancesRequestSchema>;

export const GetWalletBalancesResponseSchema = z.object({
  balances: z.array(BalanceSchema),
});
export type GetWalletBalancesResponse = z.infer<typeof GetWalletBalancesResponseSchema>;
