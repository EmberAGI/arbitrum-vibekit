import {
  createExecution,
  Delegation,
  ExecutionMode,
  MetaMaskSmartAccount,
} from "@metamask/delegation-toolkit";
import { OnchainClients } from "../utils/clients";
import { OnchainActionsClient } from "../onchain";
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import { executeTransaction } from "../utils/transaction";
import {
  PENDLE_SWAP_ADDRESS,
  USDAI_POOL_ADDRESS,
  USDAI_ADDRESS,
} from "../utils/constants";
import { arbitrum } from "viem/chains";

export async function executeSupplyUsdaiLiquidity(
  pendleSwapDelegation: Delegation,
  agentsWallet: MetaMaskSmartAccount,
  userWalletAddress: `0x${string}`,
  clients: OnchainClients,
) {
  const client = new OnchainActionsClient("http://localhost:50051");

  const result = await client.createSupplyLiquidity({
    walletAddress: userWalletAddress,
    supplyChain: arbitrum.id.toString(),
    payableTokens: [
      {
        tokenUid: {
          chainId: arbitrum.id.toString(),
          address: USDAI_ADDRESS,
        },
        amount: "3000000000000000000", // 3 USDai (18 decimals)
      },
    ],
    poolIdentifier: {
      chainId: arbitrum.id.toString(),
      address: USDAI_POOL_ADDRESS,
    },
  });

  const executions = createExecution({
    target: PENDLE_SWAP_ADDRESS,
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
