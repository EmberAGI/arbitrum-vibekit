import type { PopulatedTransaction } from 'ethers';

/**
 * Vault action types
 */
export type VaultActions = 'vault-deposit' | 'vault-withdraw' | 'vault-claim-rewards';

/**
 * Parameters for vault deposit action
 */
export interface VaultDepositParams {
  vaultId: string;
  tokenAddress: string;
  amount: string;
  walletAddress: string;
  slippage?: number;
}

/**
 * Parameters for vault withdraw action
 */
export interface VaultWithdrawParams {
  vaultId: string;
  vaultSharesAddress: string;
  amount: string;
  walletAddress: string;
  slippage?: number;
}

/**
 * Parameters for vault claim rewards action
 */
export interface VaultClaimRewardsParams {
  vaultId: string;
  boostId?: string;
  walletAddress: string;
}

/**
 * Response for vault deposit action
 */
export interface VaultDepositResponse {
  vaultId: string;
  tokenAddress: string;
  amount: string;
  expectedVaultShares: string;
  transactions: PopulatedTransaction[];
  chainId: string;
}

/**
 * Response for vault withdraw action
 */
export interface VaultWithdrawResponse {
  vaultId: string;
  vaultSharesAddress: string;
  amount: string;
  expectedTokens: string;
  transactions: PopulatedTransaction[];
  chainId: string;
}

/**
 * Response for vault claim rewards action
 */
export interface VaultClaimRewardsResponse {
  vaultId: string;
  boostId?: string;
  rewardTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>;
  transactions: PopulatedTransaction[];
  chainId: string;
}

/**
 * Callback function type for vault deposit action
 */
export type VaultDepositCallback = (params: VaultDepositParams) => Promise<VaultDepositResponse>;

/**
 * Callback function type for vault withdraw action
 */
export type VaultWithdrawCallback = (params: VaultWithdrawParams) => Promise<VaultWithdrawResponse>;

/**
 * Callback function type for vault claim rewards action
 */
export type VaultClaimRewardsCallback = (
  params: VaultClaimRewardsParams
) => Promise<VaultClaimRewardsResponse>;
