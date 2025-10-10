import { ethers, type PopulatedTransaction } from 'ethers';
import { createBeefyVaultContract } from '../contracts/index.js';
import type { VaultData } from '../types.js';

export interface DepositTransactionParams {
  vault: VaultData;
  amount: ethers.BigNumber;
  userAddress: string;
  provider: ethers.providers.Provider;
  useDepositAll?: boolean;
}

export interface DepositTransactionResult {
  approvalTx: PopulatedTransaction | null;
  depositTx: PopulatedTransaction;
  expectedShares: ethers.BigNumber;
}

/**
 * Create deposit transaction for Beefy vault
 * Follows Beefy documentation: deposit() or depositAll()
 */
export async function createDepositTransaction(
  params: DepositTransactionParams
): Promise<DepositTransactionResult> {
  const { vault, amount, userAddress, provider, useDepositAll = false } = params;

  const vaultContract = createBeefyVaultContract(vault.vaultAddress, provider);

  // Create approval transaction if needed (only for regular deposit, not depositAll)
  let approvalTx: PopulatedTransaction | null = null;
  if (!useDepositAll) {
    approvalTx = await vaultContract.createApprovalForDeposit(userAddress, amount);
  }

  // Create deposit transaction
  const depositTx = useDepositAll
    ? await vaultContract.createDepositAllTransaction(userAddress)
    : await vaultContract.createDepositTransaction(amount, userAddress);

  // Calculate expected shares (for regular deposit only)
  const expectedShares = useDepositAll
    ? ethers.BigNumber.from(0) // Can't calculate without knowing user's token balance
    : await vaultContract.calculateDepositShares(amount);

  return {
    approvalTx,
    depositTx,
    expectedShares,
  };
}

/**
 * Create deposit transaction with automatic amount detection
 * Uses depositAll() function from Beefy docs
 */
export async function createDepositAllTransaction(
  vault: VaultData,
  userAddress: string,
  provider: ethers.providers.Provider
): Promise<DepositTransactionResult> {
  return createDepositTransaction({
    vault,
    amount: ethers.BigNumber.from(0), // Not used for depositAll
    userAddress,
    provider,
    useDepositAll: true,
  });
}
