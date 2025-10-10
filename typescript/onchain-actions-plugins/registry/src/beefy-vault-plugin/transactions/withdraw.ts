import { ethers, type PopulatedTransaction } from 'ethers';
import { createBeefyVaultContract } from '../contracts/index.js';
import type { VaultData } from '../types.js';

export interface WithdrawTransactionParams {
  vault: VaultData;
  shares: ethers.BigNumber;
  userAddress: string;
  provider: ethers.providers.Provider;
  useWithdrawAll?: boolean;
}

export interface WithdrawTransactionResult {
  withdrawTx: PopulatedTransaction;
  expectedTokens: ethers.BigNumber;
}

/**
 * Create withdraw transaction for Beefy vault
 * Follows Beefy documentation: withdraw() or withdrawAll()
 */
export async function createWithdrawTransaction(
  params: WithdrawTransactionParams
): Promise<WithdrawTransactionResult> {
  const { vault, shares, userAddress, provider, useWithdrawAll = false } = params;

  const vaultContract = createBeefyVaultContract(vault.vaultAddress, provider);

  // Create withdraw transaction
  const withdrawTx = useWithdrawAll
    ? await vaultContract.createWithdrawAllTransaction(userAddress)
    : await vaultContract.createWithdrawTransaction(shares, userAddress);

  // Calculate expected tokens (for regular withdraw only)
  const expectedTokens = useWithdrawAll
    ? ethers.BigNumber.from(0) // Can't calculate without knowing user's share balance
    : await vaultContract.calculateWithdrawAmount(shares);

  return {
    withdrawTx,
    expectedTokens,
  };
}

/**
 * Create withdraw transaction for all user shares
 * Uses withdrawAll() function from Beefy docs
 */
export async function createWithdrawAllTransaction(
  vault: VaultData,
  userAddress: string,
  provider: ethers.providers.Provider
): Promise<WithdrawTransactionResult> {
  return createWithdrawTransaction({
    vault,
    shares: ethers.BigNumber.from(0), // Not used for withdrawAll
    userAddress,
    provider,
    useWithdrawAll: true,
  });
}

/**
 * Get user's current mooToken balance for a vault
 */
export async function getUserVaultBalance(
  vault: VaultData,
  userAddress: string,
  provider: ethers.providers.Provider
): Promise<ethers.BigNumber> {
  const vaultContract = createBeefyVaultContract(vault.vaultAddress, provider);
  return vaultContract.balanceOf(userAddress);
}

/**
 * Calculate how many tokens user would receive for withdrawing all shares
 */
export async function calculateWithdrawAllAmount(
  vault: VaultData,
  userAddress: string,
  provider: ethers.providers.Provider
): Promise<ethers.BigNumber> {
  const vaultContract = createBeefyVaultContract(vault.vaultAddress, provider);
  const userShares = await vaultContract.balanceOf(userAddress);

  if (userShares.eq(0)) {
    return ethers.BigNumber.from(0);
  }

  return vaultContract.calculateWithdrawAmount(userShares);
}
