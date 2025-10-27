import { z } from 'zod';
import { ChainTypeSchema, TransactionTypeSchema } from './enums.js';

export const TokenIdentifierSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});
export type TokenIdentifier = z.infer<typeof TokenIdentifierSchema>;

export const TokenSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  name: z.string(),
  symbol: z.string(),
  isNative: z.boolean(),
  decimals: z.number().int(),
  iconUri: z.string().optional(),
  isVetted: z.boolean(),
});
export type Token = z.infer<typeof TokenSchema>;

export const ChainSchema = z.object({
  chainId: z.string(),
  type: ChainTypeSchema,
  iconUri: z.string(),
  nativeToken: TokenSchema,
  httpRpcUrl: z.string(),
  name: z.string(),
  blockExplorerUrls: z.array(z.string()),
});
export type Chain = z.infer<typeof ChainSchema>;

export const FeeBreakdownSchema = z.object({
  serviceFee: z.string(),
  slippageCost: z.string(),
  total: z.string(),
  feeDenomination: z.string(),
});
export type FeeBreakdown = z.infer<typeof FeeBreakdownSchema>;

export const TransactionPlanSchema = z.object({
  type: TransactionTypeSchema,
  to: z.string(),
  data: z.string(),
  value: z.string(),
  chainId: z.string(),
});
export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

export const TransactionPlanErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.string()),
});
export type TransactionPlanError = z.infer<typeof TransactionPlanErrorSchema>;

export const ProviderTrackingInfoSchema = z.object({
  requestId: z.string(),
  providerName: z.string(),
  explorerUrl: z.string(),
});
export type ProviderTrackingInfo = z.infer<typeof ProviderTrackingInfoSchema>;

export const SwapEstimationSchema = z.object({
  baseTokenDelta: z.string(),
  quoteTokenDelta: z.string(),
  effectivePrice: z.string(),
  timeEstimate: z.string(),
  expiration: z.string(),
});
export type SwapEstimation = z.infer<typeof SwapEstimationSchema>;

export const ProviderTrackingStatusSchema = z.object({
  requestId: z.string(),
  transactionId: z.string(),
  providerName: z.string(),
  explorerUrl: z.string(),
  status: z.string(),
});
export type ProviderTrackingStatus = z.infer<typeof ProviderTrackingStatusSchema>;

export const BalanceSchema = z.object({
  token: TokenIdentifierSchema,
  amount: z.string(),
  symbol: z.string().optional(),
  valueUsd: z.number().optional(),
  decimals: z.number().int().optional(),
});
export type Balance = z.infer<typeof BalanceSchema>;
