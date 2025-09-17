import { z } from 'zod';

export const ChainTypeSchema = z.enum(['UNSPECIFIED', 'EVM', 'SOLANA', 'COSMOS']);
export type ChainType = z.infer<typeof ChainTypeSchema>;

// TransactionType
export const TransactionTypes = {
  TRANSACTION_TYPE_UNSPECIFIED: 'TRANSACTION_TYPE_UNSPECIFIED' as const,
  EVM_TX: 'EVM_TX' as const,
  SOLANA_TX: 'SOLANA_TX' as const,
} as const;

export const TransactionTypeSchema = z.enum(
  Object.values(TransactionTypes) as [string, ...string[]]
);
export type TransactionType = keyof typeof TransactionTypes;
