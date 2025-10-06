import { z } from 'zod';

import {
  TransactionPlanSchema,
  type TransactionArtifact,
  createTransactionArtifactSchema,
  AskEncyclopediaSchema,
  type AskEncyclopediaArgs,
  TokenIdentifierSchema,
  type TokenIdentifier,
} from './common.js';
import { TokenSchema } from './token.js';

//
// Position and Vault Schemas
//

// Schema for vault information
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
});
export type VaultInfo = z.infer<typeof VaultInfoSchema>;

// Schema for user vault position
export const UserVaultPositionSchema = z.object({
  vaultId: z.string(),
  vaultName: z.string(),
  vaultShares: z.string(),
  vaultSharesUsd: z.string(),
  underlyingBalance: z.string(),
  underlyingBalanceUsd: z.string(),
  depositToken: TokenSchema,
  earnedToken: TokenSchema,
  apy: z.number().optional(),
  pricePerFullShare: z.string(),
});
export type UserVaultPosition = z.infer<typeof UserVaultPositionSchema>;

export const VaultPositionSchema = z.object({
  vaultPositions: z.array(UserVaultPositionSchema),
  totalValueUsd: z.string(),
});
export type VaultPosition = z.infer<typeof VaultPositionSchema>;

export const GetWalletVaultPositionsResponseSchema = z.object({
  positions: z.array(UserVaultPositionSchema),
});
export type GetWalletVaultPositionsResponse = z.infer<typeof GetWalletVaultPositionsResponseSchema>;

//
// Tool Response Schemas
//

// Schema for the vault deposit tool's nested JSON response
export const VaultDepositResponseSchema = z.object({
  vaultId: z.string(),
  tokenUid: TokenIdentifierSchema,
  amount: z.string(),
  expectedVaultShares: z.string(),
  walletAddress: z.string(),
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type VaultDepositResponse = z.infer<typeof VaultDepositResponseSchema>;

// Schema for the vault withdraw tool's nested JSON response
export const VaultWithdrawResponseSchema = z.object({
  vaultId: z.string(),
  vaultSharesUid: TokenIdentifierSchema,
  amount: z.string(),
  expectedTokens: z.string(),
  walletAddress: z.string(),
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type VaultWithdrawResponse = z.infer<typeof VaultWithdrawResponseSchema>;

// Schema for the vault claim rewards tool's nested JSON response
export const VaultClaimRewardsResponseSchema = z.object({
  vaultId: z.string(),
  boostId: z.string().optional(),
  rewardTokens: z.array(
    z.object({
      tokenUid: TokenIdentifierSchema,
      amount: z.string(),
    })
  ),
  walletAddress: z.string(),
  transactions: z.array(TransactionPlanSchema),
  chainId: z.string(),
});
export type VaultClaimRewardsResponse = z.infer<typeof VaultClaimRewardsResponseSchema>;

// Preview schema for vault transactions
export const VaultPreviewSchema = z.object({
  vaultId: z.string(),
  vaultName: z.string(),
  tokenName: z.string(),
  amount: z.string(),
  action: z.enum(['deposit', 'withdraw', 'claim-rewards']),
  chainId: z.string(),
  // Additional fields for specific actions
  expectedVaultShares: z.string().optional(),
  expectedTokens: z.string().optional(),
  apy: z.number().optional(),
});
export type VaultPreview = z.infer<typeof VaultPreviewSchema>;

// Define shared artifact schema for vault transactions
export const VaultTransactionArtifactSchema = createTransactionArtifactSchema(VaultPreviewSchema);
export type VaultTransactionArtifact = TransactionArtifact<VaultPreview>;

//
// Agent Capability Schemas
//

export const VaultCapabilitySchema = z.object({
  vaultId: z.string(),
  vaultName: z.string(),
  currentApy: z.number().optional(),
  tvl: z.number().optional(),
  underlyingToken: TokenSchema.optional(),
  vaultToken: TokenSchema.optional(),
  strategyType: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['active', 'eol']).optional(),
});
export type VaultCapability = z.infer<typeof VaultCapabilitySchema>;

export const VaultAgentCapabilitySchema = z.object({
  vaultCapability: VaultCapabilitySchema.optional(),
});
export type VaultAgentCapability = z.infer<typeof VaultAgentCapabilitySchema>;

export const VaultGetCapabilitiesResponseSchema = z.object({
  capabilities: z.array(VaultAgentCapabilitySchema),
});
export type VaultGetCapabilitiesResponse = z.infer<typeof VaultGetCapabilitiesResponseSchema>;

//
// Agent Tool Schemas
//

export const VaultDepositWithdrawSchema = z.object({
  vaultId: z.string().describe('The unique identifier of the vault to interact with.'),
  tokenName: z
    .string()
    .describe(
      "The symbol of the token (e.g., 'USDC', 'WETH'). Must be one of the available tokens."
    ),
  amount: z
    .string()
    .describe('The amount of the token to use, as a string representation of a number.'),
});
export type VaultDepositWithdrawArgs = z.infer<typeof VaultDepositWithdrawSchema>;

export const VaultClaimRewardsSchema = z.object({
  vaultId: z.string().describe('The unique identifier of the vault to claim rewards from.'),
  boostId: z.string().optional().describe('Optional boost ID for claiming specific boost rewards.'),
});
export type VaultClaimRewardsArgs = z.infer<typeof VaultClaimRewardsSchema>;

export const GetWalletVaultPositionsSchema = z.object({});
export type GetWalletVaultPositionsArgs = z.infer<typeof GetWalletVaultPositionsSchema>;

// Define an alias for the vault interface
export { AskEncyclopediaSchema as VaultAskEncyclopediaSchema };
export type VaultAskEncyclopediaArgs = AskEncyclopediaArgs;

// Additional vault-related types
export interface VaultTokenInfo extends TokenIdentifier {
  decimals: number;
}
