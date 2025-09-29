import { z } from 'zod';
import {
  TokenIdentifierSchema,
  FeeBreakdownSchema,
  TransactionPlanSchema,
  TransactionPlanErrorSchema,
  TokenSchema,
} from './core.js';

export const BorrowTokensRequestSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
});
export type BorrowTokensRequest = z.infer<typeof BorrowTokensRequestSchema>;

export const BorrowTokensResponseSchema = z.object({
  currentBorrowApy: z.string(),
  liquidationThreshold: z.string(),
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
  error: TransactionPlanErrorSchema.optional(),
  chainId: z.string(),
});
export type BorrowTokensResponse = z.infer<typeof BorrowTokensResponseSchema>;

export const RepayTokensRequestSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
});
export type RepayTokensRequest = z.infer<typeof RepayTokensRequestSchema>;

export const RepayTokensResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
  error: TransactionPlanErrorSchema.optional(),
  chainId: z.string(),
});
export type RepayTokensResponse = z.infer<typeof RepayTokensResponseSchema>;

export const SupplyTokensRequestSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
});
export type SupplyTokensRequest = z.infer<typeof SupplyTokensRequestSchema>;

export const SupplyTokensResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
  error: TransactionPlanErrorSchema.optional(),
  chainId: z.string(),
});
export type SupplyTokensResponse = z.infer<typeof SupplyTokensResponseSchema>;

export const WithdrawTokensRequestSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
});
export type WithdrawTokensRequest = z.infer<typeof WithdrawTokensRequestSchema>;

export const WithdrawTokensResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
  error: TransactionPlanErrorSchema.optional(),
  chainId: z.string(),
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

export const BorrowPositionSchema = z.object({
  walletAddress: z.string(),
  totalLiquidityUsd: z.string(),
  totalCollateralUsd: z.string(),
  totalBorrowsUsd: z.string(),
  netWorthUsd: z.string(),
  healthFactor: z.string(),
  positions: z.array(TokenPositionSchema),
});
export type BorrowPosition = z.infer<typeof BorrowPositionSchema>;

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

export const LendingPositionSchema = z.object({
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
export type LendingPosition = z.infer<typeof LendingPositionSchema>;

export const LendingReserveSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  symbol: z.string(),
  decimals: z.number().int(),
  supplyRate: z.string(),
  borrowRate: z.string(),
  reserveFactor: z.string(),
  reserveLiquidationThreshold: z.string(),
});
export type LendingReserve = z.infer<typeof LendingReserveSchema>;

export const GetLendingUserSummaryRequestSchema = z.object({
  walletAddress: z.string(),
});
export type GetLendingUserSummaryRequest = z.infer<typeof GetLendingUserSummaryRequestSchema>;

export const GetLendingReservesResponseSchema = z.object({
  reserves: z.array(LendingReserveSchema),
});
export type GetLendingReservesResponse = z.infer<typeof GetLendingReservesResponseSchema>;
