import { formatEther, parseEther } from 'viem';
import type { SendUserOperationParameters } from 'viem/account-abstraction';

import type { OnchainClients } from './clients.js';
import { MAX_GAS_SPEND_ETH } from './constants.js';

const DEFAULT_GAS_LIMIT = 850_000n;

export async function executeTransaction(
  clients: OnchainClients,
  parameters: SendUserOperationParameters,
  gasBudgetEth = MAX_GAS_SPEND_ETH,
) {
  const { fast } = await clients.pimlico.getUserOperationGasPrice();
  const estimatedCostWei = fast.maxFeePerGas * DEFAULT_GAS_LIMIT;
  const estimatedCostEth = Number(formatEther(estimatedCostWei));

  if (estimatedCostEth > gasBudgetEth) {
    throw new Error(
      `Estimated gas cost ${estimatedCostEth} ETH exceeds budget ${gasBudgetEth} ETH`,
    );
  }

  const userOperationHash = await clients.bundler.sendUserOperation({
    paymaster: clients.paymaster,
    ...fast,
    ...parameters,
  });

  const { receipt } = await clients.bundler.waitForUserOperationReceipt({
    hash: userOperationHash,
  });

  return receipt;
}

export function assertGasBudget(maxGasSpendEth: number) {
  if (maxGasSpendEth > MAX_GAS_SPEND_ETH) {
    throw new Error(
      `Configured gas budget ${maxGasSpendEth} exceeds protocol limit of ${MAX_GAS_SPEND_ETH} ETH`,
    );
  }
  if (maxGasSpendEth <= 0) {
    throw new Error('Gas budget must be positive');
  }
}

export function toWei(amountEth: number) {
  return parseEther(amountEth.toString());
}
