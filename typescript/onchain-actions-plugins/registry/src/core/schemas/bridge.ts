import { z } from 'zod';
import { FeeBreakdownSchema, TokenSchema, TransactionPlanSchema } from './core.js';

export const BridgeDepositRequestSchema = z.object({
  token: TokenSchema, // underlying or native token
  amount: z.bigint(),
  fromWalletAddress: z.string(), // parent-chain wallet
  toWalletAddress: z.string().optional(), // optional different recipient on child chain
});
export type BridgeDepositRequest = z.infer<typeof BridgeDepositRequestSchema>;

export const BridgeDepositResponseSchema = z.object({
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
});
export type BridgeDepositResponse = z.infer<typeof BridgeDepositResponseSchema>;

export const BridgeWithdrawRequestSchema = z.object({
  token: TokenSchema, // underlying or native token
  amount: z.bigint(),
  fromWalletAddress: z.string(), // child-chain wallet
  toWalletAddress: z.string().optional(), // optional different recipient on parent chain
});
export type BridgeWithdrawRequest = z.infer<typeof BridgeWithdrawRequestSchema>;

export const BridgeWithdrawResponseSchema = z.object({
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
});
export type BridgeWithdrawResponse = z.infer<typeof BridgeWithdrawResponseSchema>;

export const BridgeGetMessageStatusRequestSchema = z.object({
  txHash: z.string(),
  direction: z.enum(['parent-to-child', 'child-to-parent']),
});
export type BridgeGetMessageStatusRequest = z.infer<
  typeof BridgeGetMessageStatusRequestSchema
>;

export const BridgeGetMessageStatusResponseSchema = z.object({
  status: z.enum(['pending', 'redeemable', 'redeemed', 'failed']),
  destinationTxHash: z.string().optional(),
});
export type BridgeGetMessageStatusResponse = z.infer<
  typeof BridgeGetMessageStatusResponseSchema
>;


