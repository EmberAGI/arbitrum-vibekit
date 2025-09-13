import type { EthereumTransactionTypeExtended } from '@aave/contract-helpers';
import { type PopulatedTransaction, ethers } from 'ethers';
import { getAaveError } from './errors.js';

export async function populateTransaction(
  tx: EthereumTransactionTypeExtended
): Promise<PopulatedTransaction> {
  let txData = null;
  try {
    txData = await tx.tx();
    /* eslint-disable @typescript-eslint/no-explicit-any */
  } catch (e: any) {
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // error reason looks like 'execution reverted: revert: 32', with the aave
    // domain error code at the very end
    const errorCode = (e.reason || '').split(' ').pop();
    // If we end up passing garbage to getAaveError, it does not matter - it will return null
    const aaveError = getAaveError(errorCode);
    if (aaveError !== null) {
      throw aaveError;
    } else {
      // we can hope that the LLM will provide an analysis of the error on the fly
      throw e;
    }
  }
  return {
    value: ethers.BigNumber.from(txData.value || 0),
    from: txData.from,
    to: txData.to,
    data: txData.data,
  };
}
