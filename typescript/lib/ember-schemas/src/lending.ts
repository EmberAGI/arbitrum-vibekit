import { z } from 'zod';

import {
  TransactionPlanSchema,
  type TransactionArtifact,
  createTransactionArtifactSchema,
  AskEncyclopediaSchema,
  type AskEncyclopediaArgs,
  TokenIdentifierSchema,
  type TokenIdentifier
} from './common.js';
import { TokenSchema } from './token.js';

//
// Position and Reserve Schemas
//

// Schema for the position information
export const UserReserveSchema = z.object({
  token: TokenSchema,
  underlyingBalance: z.string(),
  underlyingBalanceUsd: z.string(),
  variableBorrows: z.string(),
  variableBorrowsUsd: z.string(),
  totalBorrows: z.string(),
  totalBorrowsUsd: z.string(),
});
export type UserReserve = z.infer<typeof UserReserveSchema>;

export const LendingPositionSchema = z.object({
  userReserves: z.array(UserReserveSchema),
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

export const PositionSchema = z.object({
  lendingPosition: LendingPositionSchema,
});
export type Position = z.infer<typeof PositionSchema>;

export const GetWalletLendingPositionsResponseSchema = z.object({
  positions: z.array(LendingPositionSchema),
});
export type GetWalletLendingPositionsResponse = z.infer<typeof GetWalletLendingPositionsResponseSchema>;

//
// Tool Response Schemas
//

// Schema for the supply tool's nested JSON response
export const SupplyResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type SupplyResponse = z.infer<typeof SupplyResponseSchema>;

// Schema for the withdraw tool's nested JSON response
export const WithdrawResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type WithdrawResponse = z.infer<typeof WithdrawResponseSchema>;

// Schema for the borrow tool's nested JSON response
export const BorrowResponseSchema = z.object({
  currentBorrowApy: z.string(),
  liquidationThreshold: z.string(),
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type BorrowResponse = z.infer<typeof BorrowResponseSchema>;

// Schema for the repay tool's nested JSON response
export const RepayResponseSchema = z.object({
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  walletAddress: z.string(),
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type RepayResponse = z.infer<typeof RepayResponseSchema>;

// Preview schema for lending transactions
export const LendingPreviewSchema = z.object({
  tokenName: z.string(),
  amount: z.string(),
  action: z.enum(['borrow', 'repay', 'supply', 'withdraw']),
  chainId: z.string(),
  // Additional fields used by borrow operation
  currentBorrowApy: z.string().optional(),
  liquidationThreshold: z.string().optional(),
});
export type LendingPreview = z.infer<typeof LendingPreviewSchema>;

// Define shared artifact schema for lending transactions
export const LendingTransactionArtifactSchema =
  createTransactionArtifactSchema(LendingPreviewSchema);
export type LendingTransactionArtifact = TransactionArtifact<LendingPreview>;

//
// Agent Capability Schemas
//

export const LendingCapabilitySchema = z.object({
  capabilityId: z.string().optional(),
  currentSupplyApy: z.string().optional(),
  currentBorrowApy: z.string().optional(),
  underlyingToken: TokenSchema.optional(),
  maxLtv: z.string().optional(),
  liquidationThreshold: z.string().optional(),
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

//
// Agent Tool Schemas
//

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

export const GetWalletLendingPositionsSchema = z.object({});
export type GetWalletLendingPositionsArgs = z.infer<typeof GetWalletLendingPositionsSchema>;

// Define an alias for the lending interface
export { AskEncyclopediaSchema as LendingAskEncyclopediaSchema };
export type LendingAskEncyclopediaArgs = AskEncyclopediaArgs;

// Additional lending-related types
export interface TokenInfo extends TokenIdentifier {
  decimals: number;
} 