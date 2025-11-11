import {
  createExecution,
  Delegation,
  ExecutionMode,
  MetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import { OnchainClients } from '../utils/clients';
import { OnchainActionsClient } from './onchain-actions-client';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { executeTransaction } from '../utils/transaction';
import { arbitrum } from 'viem/chains';

export async function executeSupplyUsdaiLiquidity(
  pendleSwapDelegation: Delegation,
  agentsWallet: MetaMaskSmartAccount,
  userWalletAddress: `0x${string}`,
  clients: OnchainClients,
  pendleSwapAddress: `0x${string}`,
  usdAiPoolAddress: `0x${string}`,
  usdAiAddress: `0x${string}`,
  amountToSupply: bigint,
) {
  console.log('[Workflow] Executing supply liquidity transaction...');
  const client = new OnchainActionsClient('https://api.emberai.xyz');

  const result = await client.createSupplyLiquidity({
    walletAddress: userWalletAddress,
    supplyChain: arbitrum.id.toString(),
    payableTokens: [
      {
        tokenUid: {
          chainId: arbitrum.id.toString(),
          address: usdAiAddress,
        },
        amount: amountToSupply.toString(),
      },
    ],
    poolIdentifier: {
      chainId: arbitrum.id.toString(),
      address: usdAiPoolAddress,
    },
  });

  const executions = createExecution({
    target: pendleSwapAddress,
    callData: result.transactions[0].data,
  });

  const redeemDelegationCalldata = DelegationManager.encode.redeemDelegations({
    delegations: [[pendleSwapDelegation]],
    modes: [ExecutionMode.SingleDefault],
    executions: [[executions]],
  });

  const receipt = await executeTransaction(clients, {
    account: agentsWallet,
    calls: [
      {
        to: agentsWallet.address,
        data: redeemDelegationCalldata,
      },
    ],
  });

  return receipt;
}
