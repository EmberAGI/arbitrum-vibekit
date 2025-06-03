import { z } from 'zod';
import { TransactionPlanSchema } from 'ember-mcp-tool-server';

// Tool parameter schemas
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

export const GetUserPositionsSchema = z.object({});

export const AskEncyclopediaSchema = z.object({
  question: z.string().describe('The question to ask the Aave encyclopedia.'),
});

// MCP Response schemas
export const ZodTokenUidSchema = z.object({
  chainId: z.string(),
  address: z.string(),
});

export const ZodBorrowResponseSchema = z
  .object({
    currentBorrowApy: z.string(),
    liquidationThreshold: z.string(),
    transactions: z.array(TransactionPlanSchema),
    chainId: z.string(),
  })
  .passthrough();

export const ZodRepayResponseSchema = z
  .object({
    tokenUid: ZodTokenUidSchema,
    amount: z.string(),
    borrowerWalletAddress: z.string(),
    transactions: z.array(TransactionPlanSchema),
    chainId: z.string(),
  })
  .passthrough();

export const ZodSupplyResponseSchema = z
  .object({
    tokenUid: ZodTokenUidSchema,
    amount: z.string(),
    supplierWalletAddress: z.string(),
    transactions: z.array(TransactionPlanSchema),
    chainId: z.string(),
  })
  .passthrough();

export const ZodWithdrawResponseSchema = z
  .object({
    tokenUid: ZodTokenUidSchema,
    amount: z.string(),
    lenderWalletAddress: z.string(),
    transactions: z.array(TransactionPlanSchema),
    chainId: z.string(),
  })
  .passthrough();

export const ZodGetWalletPositionsResponseSchema = z
  .object({
    positions: z.array(z.any()), // Simplified for now
  })
  .passthrough();

// Lending preview schema for artifacts
export const LendingPreviewSchema = z
  .object({
    tokenName: z.string(),
    amount: z.string(),
    action: z.enum(['borrow', 'repay', 'supply', 'withdraw']),
    chainId: z.string(),
  })
  .passthrough();
