import {
  createExecution,
  type Delegation,
  ExecutionMode,
  type MetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import { encodeFunctionData, erc20Abi } from 'viem';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';

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
  delegation,
  agentAccount,
  clients,
}: {
  publicClient: OnchainClients['public'];
  tokenAddress: `0x${string}`;
  ownerAccount: `0x${string}`;
  spenderAddress: `0x${string}`;
  requiredAmount: bigint;
  delegation: Delegation;
  agentAccount: MetaMaskSmartAccount;
  clients: OnchainClients;
}) {
  const allowance = await checkTokenAllowance(publicClient, tokenAddress, ownerAccount, spenderAddress);
  if (allowance >= requiredAmount) {
    return;
  }

  const approveCallData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [spenderAddress, requiredAmount],
  });
  const execution = createExecution({
    target: tokenAddress,
    callData: approveCallData,
  });

  const redeemCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[delegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });

  await executeTransaction(clients, {
    account: agentAccount,
    calls: [
      {
        to: agentAccount.address,
        data: redeemCalldata,
      },
    ],
  });
}
