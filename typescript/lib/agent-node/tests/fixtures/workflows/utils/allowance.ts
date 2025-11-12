import type { Delegation, MetaMaskSmartAccount } from '@metamask/delegation-toolkit';
import { createExecution, ExecutionMode } from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import type { PublicClient } from 'viem';
import { encodeFunctionData, erc20Abi } from 'viem';

import type { OnchainClients } from './clients.js';
import { executeTransaction } from './transaction.js';

export async function checkTokenAllowance(
  publicClient: PublicClient,
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
): Promise<bigint> {
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [ownerAddress, spenderAddress],
  });

  return allowance;
}

export async function approveTokenDirectStep(
  tokenAddress: `0x${string}`,
  requiredAmount: bigint,
  approveDelegation: Delegation,
  agentAccount: MetaMaskSmartAccount,
  mySmartAccountAddress: `0x${string}`,
  contractSpenderAddress: `0x${string}`,
  clients: OnchainClients,
) {
  const currentAllowance = await checkTokenAllowance(
    clients.public,
    tokenAddress,
    mySmartAccountAddress,
    contractSpenderAddress,
  );

  const hasTokenApproval = currentAllowance >= requiredAmount;

  if (hasTokenApproval) {
    return;
  }

  const tokenApproveCallData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [contractSpenderAddress, requiredAmount],
  });

  const execution = createExecution({
    target: tokenAddress,
    callData: tokenApproveCallData,
  });

  const redeemDelegationCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[approveDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[execution]],
  });

  const approveReceipt = await executeTransaction(clients, {
    account: agentAccount,
    calls: [
      {
        to: agentAccount.address,
        data: redeemDelegationCalldata,
      },
    ],
  });

  return approveReceipt;
}
