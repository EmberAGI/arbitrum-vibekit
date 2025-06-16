import { z } from "zod";
import {
  TokenIdentifierSchema,
  FeeBreakdownSchema,
  TransactionPlanSchema,
  TransactionPlanErrorSchema,
  TokenSchema,
} from "./core.js";

export const BorrowTokensRequestSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  borrowerWalletAddress: z.string(),
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
  borrowerWalletAddress: z.string(),
});
export type RepayTokensRequest = z.infer<typeof RepayTokensRequestSchema>;

export const RepayTokensResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  borrowerWalletAddress: z.string(),
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
  error: TransactionPlanErrorSchema.optional(),
  chainId: z.string(),
});
export type RepayTokensResponse = z.infer<typeof RepayTokensResponseSchema>;

export const SupplyTokensRequestSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  supplierWalletAddress: z.string(),
});
export type SupplyTokensRequest = z.infer<typeof SupplyTokensRequestSchema>;

export const SupplyTokensResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  supplierWalletAddress: z.string(),
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
  error: TransactionPlanErrorSchema.optional(),
  chainId: z.string(),
});
export type SupplyTokensResponse = z.infer<typeof SupplyTokensResponseSchema>;

export const WithdrawTokensRequestSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  lenderWalletAddress: z.string(),
});
export type WithdrawTokensRequest = z.infer<typeof WithdrawTokensRequestSchema>;

export const WithdrawTokensResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  lenderWalletAddress: z.string(),
  feeBreakdown: FeeBreakdownSchema.optional(),
  transactions: z.array(TransactionPlanSchema),
  error: TransactionPlanErrorSchema.optional(),
  chainId: z.string(),
});
export type WithdrawTokensResponse = z.infer<
  typeof WithdrawTokensResponseSchema
>;

export const TokenPositionSchema = z.object({
  underlyingToken: TokenSchema,
  borrowRate: z.string(),
  supplyBalance: z.string(),
  borrowBalance: z.string(),
  valueUsd: z.string(),
});
export type TokenPosition = z.infer<typeof TokenPositionSchema>;

export const BorrowPositionSchema = z.object({
  borrowerWalletAddress: z.string(),
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
  userAddress: z.string(),
});
export type GetLendingUserSummaryRequest = z.infer<
  typeof GetLendingUserSummaryRequestSchema
>;

export const GetLendingReservesResponseSchema = z.object({
  reserves: z.array(LendingReserveSchema),
});
export type GetLendingReservesResponse = z.infer<
  typeof GetLendingReservesResponseSchema
>;

export const BorrowRepaySupplyWithdrawSchema = z.object({
  tokenName: z
    .string()
    .describe(
      "The symbol of the token (e.g., 'USDC', 'WETH'). Must be one of the available tokens."
    ),
  amount: z
    .string()
    .describe('The amount of the token to use, as a string representation of a number.'),
});
export type BorrowRepaySupplyWithdrawArgs = z.infer<typeof BorrowRepaySupplyWithdrawSchema>;

export const GetUserPositionsSchema = z.object({});
export type GetUserPositionsArgs = z.infer<typeof GetUserPositionsSchema>;

// Lending capabilities schemas
export const LendingCapabilitySchema = z.object({
  underlyingToken: TokenSchema.optional(),
  supplyRate: z.string().optional(),
  borrowRate: z.string().optional(),
  liquidationThreshold: z.string().optional(),
  maxSupply: z.string().optional(),
  maxBorrow: z.string().optional(),
});
export type LendingCapability = z.infer<typeof LendingCapabilitySchema>;

export const LendingAgentCapabilitySchema = z.object({
  lendingCapability: LendingCapabilitySchema.optional(),
});
export type LendingAgentCapability = z.infer<typeof LendingAgentCapabilitySchema>;

export const LendingGetCapabilitiesResponseSchema = z.object({
  capabilities: z.array(LendingAgentCapabilitySchema),
});
export type LendingGetCapabilitiesResponse = z.infer<typeof LendingGetCapabilitiesResponseSchema>; 