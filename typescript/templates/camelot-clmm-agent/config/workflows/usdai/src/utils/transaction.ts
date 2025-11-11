import { SendUserOperationParameters } from 'viem/account-abstraction';
import { OnchainClients } from './clients';

export async function executeTransaction(
  clients: OnchainClients,
  parameters: SendUserOperationParameters,
) {
  const { fast: fee } = await clients.pimlico.getUserOperationGasPrice();
  const userOperationHash = await clients.bundler.sendUserOperation({
    paymaster: clients.paymaster,
    ...fee,
    ...parameters,
  });
  const { receipt } = await clients.bundler.waitForUserOperationReceipt({
    hash: userOperationHash,
  });
  return receipt;
}
