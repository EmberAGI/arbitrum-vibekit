import {
  createExecution,
  Delegation,
  ExecutionMode,
  MetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import { encodeFunctionData, erc20Abi, PublicClient } from 'viem';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { executeTransaction } from './transaction';
import { OnchainClients } from './clients';

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
  console.log(
    '[Workflow] Checking token allowance... ',
    tokenAddress,
    mySmartAccountAddress,
    contractSpenderAddress,
  );
  const currentAllowance = await checkTokenAllowance(
    clients.public,
    tokenAddress,
    mySmartAccountAddress,
    contractSpenderAddress,
  );
  console.log('[Workflow] Current allowance: ', currentAllowance);
  const hasTokenApproval = currentAllowance >= requiredAmount;

  if (hasTokenApproval) {
    return;
  }

  console.log(
    '[Workflow] Approving token... ',
    tokenAddress,
    contractSpenderAddress,
    requiredAmount,
  );
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
