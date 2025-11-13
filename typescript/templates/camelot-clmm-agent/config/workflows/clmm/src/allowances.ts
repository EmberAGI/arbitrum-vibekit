import { type MetaMaskSmartAccount } from '@metamask/delegation-toolkit';
import { encodeFunctionData, erc20Abi } from 'viem';

import type { OnchainClients } from './clients.js';
import { executeTransaction } from './transaction.js';

export async function checkTokenAllowance(
  publicClient: OnchainClients['public'],
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
) {
  return publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  });
}

export async function ensureAllowance({
  publicClient,
  tokenAddress,
  ownerAccount,
  spenderAddress,
  requiredAmount,
  agentAccount,
  clients,
}: {
  publicClient: OnchainClients['public'];
  tokenAddress: `0x${string}`;
  ownerAccount: `0x${string}`;
  spenderAddress: `0x${string}`;
  requiredAmount: bigint;
  agentAccount: MetaMaskSmartAccount;
  clients: OnchainClients;
}) {
  const allowance = await checkTokenAllowance(
    publicClient,
    tokenAddress,
    ownerAccount,
    spenderAddress,
  );
  if (allowance >= requiredAmount) {
    return;
  }

  const approveCallData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spenderAddress, requiredAmount],
  });
  await executeTransaction(clients, {
    account: agentAccount,
    calls: [
      {
        to: tokenAddress,
        data: approveCallData,
      },
    ],
  });
}
