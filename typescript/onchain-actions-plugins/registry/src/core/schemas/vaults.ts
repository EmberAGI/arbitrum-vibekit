import { z } from 'zod';

/**
 * Schema for vault information based on Beefy API structure
 */
export const VaultInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenAddress: z.string(),
  tokenDecimals: z.number(),
  earnedTokenAddress: z.string(),
  earnContractAddress: z.string(),
  strategy: z.string().optional(),
  assets: z.array(z.string()),
  apy: z.number().optional(),
  tvl: z.number().optional(),
  pricePerFullShare: z.string(),
  status: z.enum(['active', 'eol']),
  risks: z.array(z.string()).optional(),
  strategyTypeId: z.string().optional(),
  network: z.string(),
  chain: z.string(),
  createdAt: z.number().optional(),
  lastHarvest: z.number().optional(),
});
export type VaultInfo = z.infer<typeof VaultInfoSchema>;

/**
 * Schema for vault performance metrics
 */
export const VaultPerformanceSchema = z.object({
  vaultId: z.string(),
  apy: z.number(),
  tvl: z.number(),
  pricePerFullShare: z.string(),
  totalSupply: z.string().optional(),
  lastHarvest: z.number().optional(),
  harvestFrequency: z.number().optional(),
});
export type VaultPerformance = z.infer<typeof VaultPerformanceSchema>;

/**
 * Schema for user vault positions
 */
export const UserVaultPositionSchema = z.object({
  vaultId: z.string(),
  vaultName: z.string(),
  vaultShares: z.string(),
  underlyingBalance: z.string(),
  underlyingBalanceUsd: z.string(),
  depositToken: z.string(),
  earnedToken: z.string(),
  apy: z.number().optional(),
  pricePerFullShare: z.string(),
});
export type UserVaultPosition = z.infer<typeof UserVaultPositionSchema>;

/**
 * Schema for vault strategy information
 */
export const VaultStrategySchema = z.object({
  strategyAddress: z.string(),
  strategyType: z.string(),
  underlyingProtocol: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  autoCompound: z.boolean(),
  performanceFee: z.number().optional(),
});
export type VaultStrategy = z.infer<typeof VaultStrategySchema>;

/**
 * Schema for vault boost information (additional reward programs)
 */
export const VaultBoostSchema = z.object({
  id: z.string(),
  vaultId: z.string(),
  rewardToken: z.string(),
  rewardTokenAddress: z.string(),
  apy: z.number(),
  periodFinish: z.number(),
  isActive: z.boolean(),
});
export type VaultBoost = z.infer<typeof VaultBoostSchema>;

/**
 * Request/Response schemas for vault queries
 */
export const GetVaultsRequestSchema = z.object({
  chainId: z.string().optional(),
  status: z.enum(['active', 'eol', 'all']).optional().default('active'),
  strategyType: z.string().optional(),
});
export type GetVaultsRequest = z.infer<typeof GetVaultsRequestSchema>;

export const GetVaultsResponseSchema = z.object({
  vaults: z.array(VaultInfoSchema),
});
export type GetVaultsResponse = z.infer<typeof GetVaultsResponseSchema>;

export const GetVaultPerformanceRequestSchema = z.object({
  vaultId: z.string(),
});
export type GetVaultPerformanceRequest = z.infer<typeof GetVaultPerformanceRequestSchema>;

export const GetVaultPerformanceResponseSchema = z.object({
  performance: VaultPerformanceSchema,
});
export type GetVaultPerformanceResponse = z.infer<typeof GetVaultPerformanceResponseSchema>;

export const GetUserVaultPositionsRequestSchema = z.object({
  walletAddress: z.string(),
  chainId: z.string().optional(),
});
export type GetUserVaultPositionsRequest = z.infer<typeof GetUserVaultPositionsRequestSchema>;

export const GetUserVaultPositionsResponseSchema = z.object({
  positions: z.array(UserVaultPositionSchema),
});
export type GetUserVaultPositionsResponse = z.infer<typeof GetUserVaultPositionsResponseSchema>;

export const GetVaultStrategiesRequestSchema = z.object({
  chainId: z.string(),
});
export type GetVaultStrategiesRequest = z.infer<typeof GetVaultStrategiesRequestSchema>;

export const GetVaultStrategiesResponseSchema = z.object({
  strategies: z.array(VaultStrategySchema),
});
export type GetVaultStrategiesResponse = z.infer<typeof GetVaultStrategiesResponseSchema>;

export const GetVaultBoostsRequestSchema = z.object({
  chainId: z.string().optional(),
  vaultId: z.string().optional(),
  activeOnly: z.boolean().optional().default(true),
});
export type GetVaultBoostsRequest = z.infer<typeof GetVaultBoostsRequestSchema>;

export const GetVaultBoostsResponseSchema = z.object({
  boosts: z.array(VaultBoostSchema),
});
export type GetVaultBoostsResponse = z.infer<typeof GetVaultBoostsResponseSchema>;
