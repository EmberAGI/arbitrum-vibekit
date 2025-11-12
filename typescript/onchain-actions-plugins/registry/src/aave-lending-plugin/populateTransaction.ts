import type { EthereumTransactionTypeExtended } from '@aave/contract-helpers';
import { type PopulatedTransaction, ethers } from 'ethers';

import { getAaveError } from './errors.js';

export async function populateTransaction(
  tx: EthereumTransactionTypeExtended
): Promise<PopulatedTransaction> {
  let txData: PopulatedTransaction | null = null;
  try {
    txData = await tx.tx();
  } catch (unknownError) {
    const reason =
      typeof unknownError === 'object' &&
      unknownError !== null &&
      'reason' in unknownError &&
      typeof (unknownError as { reason: unknown }).reason === 'string'
        ? (unknownError as { reason: string }).reason
        : '';
    // error reason looks like 'execution reverted: revert: 32', with the aave
    // domain error code at the very end
    const errorCode = reason.split(' ').pop();
    // If we end up passing garbage to getAaveError, it does not matter - it will return null
    const aaveError = getAaveError(errorCode);
    if (aaveError !== null) {
      throw aaveError;
    } else {
      // we can hope that the LLM will provide an analysis of the error on the fly
      throw unknownError;
    }
  }
  if (!txData) {
    throw new Error('Failed to populate transaction');
  }
  return {
    value: ethers.BigNumber.from(txData.value ?? 0),
    from: txData.from,
    to: txData.to,
    data: txData.data,
  };
}
