import { z } from 'zod';
import { FeeBreakdownSchema, TransactionPlanSchema, TokenSchema } from './core.js';

export const BorrowTokensRequestSchema = z.object({
  borrowToken: TokenSchema,
  amount: z.bigint(),
  walletAddress: z.string(),
});
export type BorrowTokensRequest = z.infer<typeof BorrowTokensRequestSchema>;

export const BorrowTokensResponseSchema = z.object({
  currentBorrowApy: z.string(),
  liquidationThreshold: z.string(),
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
});
export type BorrowTokensResponse = z.infer<typeof BorrowTokensResponseSchema>;

export const RepayTokensRequestSchema = z.object({
  repayToken: TokenSchema,
  amount: z.bigint(),
  walletAddress: z.string(),
});
export type RepayTokensRequest = z.infer<typeof RepayTokensRequestSchema>;

export const RepayTokensResponseSchema = z.object({
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
});
export type RepayTokensResponse = z.infer<typeof RepayTokensResponseSchema>;

export const SupplyTokensRequestSchema = z.object({
  supplyToken: TokenSchema,
  amount: z.bigint(),
  walletAddress: z.string(),
});
export type SupplyTokensRequest = z.infer<typeof SupplyTokensRequestSchema>;

export const SupplyTokensResponseSchema = z.object({
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
});
export type SupplyTokensResponse = z.infer<typeof SupplyTokensResponseSchema>;

export const WithdrawTokensRequestSchema = z.object({
  tokenToWithdraw: TokenSchema,
  amount: z.bigint(),
  walletAddress: z.string(),
});
export type WithdrawTokensRequest = z.infer<typeof WithdrawTokensRequestSchema>;

export const WithdrawTokensResponseSchema = z.object({
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
});
export type WithdrawTokensResponse = z.infer<typeof WithdrawTokensResponseSchema>;

export const TokenPositionSchema = z.object({
  underlyingToken: TokenSchema,
  borrowRate: z.string(),
  supplyBalance: z.string(),
  borrowBalance: z.string(),
  valueUsd: z.string(),
});
export type TokenPosition = z.infer<typeof TokenPositionSchema>;

export const GetWalletLendingPositionsRequestSchema = z.object({
  walletAddress: z.string(),
});
export type GetWalletLendingPositionsRequest = z.infer<
  typeof GetWalletLendingPositionsRequestSchema
>;

export const LendTokenDetailSchema = z.object({
  token: TokenSchema,
  underlyingBalance: z.string(),
  underlyingBalanceUsd: z.string(),
  variableBorrows: z.string(),
  variableBorrowsUsd: z.string(),
  totalBorrows: z.string(),
  totalBorrowsUsd: z.string(),
});
export type LendTokenDetail = z.infer<typeof LendTokenDetailSchema>;

export const GetWalletLendingPositionsResponseSchema = z.object({
  userReserves: z.array(LendTokenDetailSchema),
  totalLiquidityUsd: z.string(),
  totalCollateralUsd: z.string(),
  totalBorrowsUsd: z.string(),
  netWorthUsd: z.string(),
  availableBorrowsUsd: z.string(),
  currentLoanToValue: z.string(),
  currentLiquidationThreshold: z.string(),
  healthFactor: z.string(),
});
export type GetWalletLendingPositionsResponse = z.infer<
  typeof GetWalletLendingPositionsResponseSchema
>;
