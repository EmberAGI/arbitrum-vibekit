import type { PopulatedTransaction } from 'ethers';

/**
 * Simple populate transaction utility for PancakeSwap.
 * Since PancakeSwap transactions are created directly, this is mainly for consistency.
 */
export async function populateTransaction(tx: PopulatedTransaction): Promise<PopulatedTransaction> {
  return tx;
}
