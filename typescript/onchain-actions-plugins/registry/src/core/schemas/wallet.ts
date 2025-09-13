import { z } from 'zod';
import { BalanceSchema } from './core.js';

export const GetWalletBalancesRequestSchema = z.object({
  walletAddress: z.string(),
});
export type GetWalletBalancesRequest = z.infer<typeof GetWalletBalancesRequestSchema>;

export const GetWalletBalancesResponseSchema = z.object({
  balances: z.array(BalanceSchema),
});
export type GetWalletBalancesResponse = z.infer<typeof GetWalletBalancesResponseSchema>;
