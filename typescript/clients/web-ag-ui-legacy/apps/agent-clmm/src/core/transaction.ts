import { parseEther } from 'viem';

import type { OnchainClients } from '../clients/clients.js';

export async function executeTransaction(
  clients: OnchainClients,
  tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
  },
) {
  const hash = await clients.wallet.sendTransaction({
    account: clients.wallet.account,
    chain: clients.wallet.chain,
    to: tx.to,
    data: tx.data,
    value: tx.value,
  });

  const receipt = await clients.public.waitForTransactionReceipt({ hash });

  return receipt;
}

export function assertGasBudget(maxGasSpendEth: number) {
  if (maxGasSpendEth <= 0) {
    throw new Error('Gas budget must be positive');
  }
}

export function toWei(amountEth: number) {
  return parseEther(amountEth.toString());
}
