import { z } from 'zod';

import { TokenIdentifierSchema } from './common.js';

export const BalanceSchema = z.object({
  token: TokenIdentifierSchema.describe("Token identifier for the balance."),
  amount: z.string().describe("Amount of the token held, as a string to maintain precision."),
  symbol: z.string().describe("Symbol of the token."),
  valueUsd: z.number().optional().describe("USD value of the balance."),
  decimals: z.number().describe("Number of decimal places the token uses."),
});

export type Balance = z.infer<typeof BalanceSchema>;

export const GetWalletBalancesSchema = z.object({
  walletAddress: z.string().describe("The wallet address to fetch balances for."),
});

export type GetWalletBalancesRequest = z.infer<typeof GetWalletBalancesSchema>;

export const GetWalletBalancesResponseSchema = z.object({
  balances: z.array(BalanceSchema).describe("Array of token balances for the wallet."),
});

export type GetWalletBalancesResponse = z.infer<typeof GetWalletBalancesResponseSchema>;