import { z } from 'zod';

export const ChainTypeSchema = z.enum(['UNSPECIFIED', 'EVM', 'SOLANA', 'COSMOS']);
export type ChainType = z.infer<typeof ChainTypeSchema>;

// CapabilityType
export const CapabilityTypes = {
  CAPABILITY_TYPE_UNSPECIFIED: 'CAPABILITY_TYPE_UNSPECIFIED' as const,
  SWAP: 'SWAP' as const,
  LENDING_MARKET: 'LENDING_MARKET' as const,
  LIQUIDITY: 'LIQUIDITY' as const,
  VAULT: 'VAULT' as const,
} as const;

export const CapabilityTypeSchema = z.enum(Object.values(CapabilityTypes) as [string, ...string[]]);
export type CapabilityType = keyof typeof CapabilityTypes;

// OrderType
export const OrderTypes = {
  ORDER_TYPE_UNSPECIFIED: 'ORDER_TYPE_UNSPECIFIED' as const,
  MARKET_BUY: 'MARKET_BUY' as const,
  MARKET_SELL: 'MARKET_SELL' as const,
  LIMIT_BUY: 'LIMIT_BUY' as const,
  LIMIT_SELL: 'LIMIT_SELL' as const,
} as const;

export const OrderTypeSchema = z.enum(Object.values(OrderTypes) as [string, ...string[]]);
export type OrderType = keyof typeof OrderTypes;

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

// TransactionPlanStatus
export const TransactionPlanStatuses = {
  UNSPECIFIED: 'UNSPECIFIED' as const,
  SUCCESS: 'SUCCESS' as const,
  ERROR: 'ERROR' as const,
} as const;

export const TransactionPlanStatusSchema = z.enum(
  Object.values(TransactionPlanStatuses) as [string, ...string[]]
);
export type TransactionPlanStatus = keyof typeof TransactionPlanStatuses;

// ProviderStatus
export const ProviderStatuses = {
  PROVIDER_STATUS_UNSPECIFIED: 'PROVIDER_STATUS_UNSPECIFIED' as const,
  PROVIDER_STATUS_SUCCESS: 'PROVIDER_STATUS_SUCCESS' as const,
  PROVIDER_STATUS_ONGOING: 'PROVIDER_STATUS_ONGOING' as const,
  PROVIDER_STATUS_NEEDS_GAS: 'PROVIDER_STATUS_NEEDS_GAS' as const,
  PROVIDER_STATUS_PARTIAL_SUCCESS: 'PROVIDER_STATUS_PARTIAL_SUCCESS' as const,
  PROVIDER_STATUS_NOT_FOUND: 'PROVIDER_STATUS_NOT_FOUND' as const,
} as const;

export const ProviderStatusSchema = z.enum(
  Object.values(ProviderStatuses) as [string, ...string[]]
);
export type ProviderStatus = keyof typeof ProviderStatuses;
