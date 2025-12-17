import {
  createExecution,
  ExecutionMode,
  getDeleGatorEnvironment,
  type Delegation,
} from "@metamask/delegation-toolkit";
import { DelegationManager } from "@metamask/delegation-toolkit/contracts";
import { createPublicClient, createWalletClient, http, type Hex, type TransactionReceipt } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, mainnet } from "viem/chains";

import type { NormalizedTransaction } from "../delegations/emberDelegations.js";

export type RedeemAndExecuteResult = {
  txHash: Hex;
  receipt: TransactionReceipt;
};

function resolveChain(chainId: number) {
  if (chainId === arbitrum.id) {
    return arbitrum;
  }
  if (chainId === mainnet.id) {
    return mainnet;
  }
  throw new Error(`Unsupported chainId ${chainId} for demo execution (add a viem chain mapping)`);
}

export async function redeemDelegationsAndExecuteTransactions(params: {
  chainId: number;
  rpcUrl: string;
  delegateePrivateKey: `0x${string}`;
  delegations: readonly Delegation[];
  transactions: readonly NormalizedTransaction[];
}): Promise<RedeemAndExecuteResult> {
  const chain = resolveChain(params.chainId);
  const environment = getDeleGatorEnvironment(params.chainId);

  const account = privateKeyToAccount(params.delegateePrivateKey);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(params.rpcUrl),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(params.rpcUrl),
  });

  if (params.delegations.length === 0) {
    throw new Error("No delegations provided for execution");
  }
  if (params.transactions.length === 0) {
    throw new Error("No transactions provided for execution");
  }

  // Execute as a single atomic batch to preserve tx plan order and to support
  // "expand then execute" multicall handling.
  const executions = params.transactions.map((tx) =>
    createExecution({
      target: tx.to,
      value: tx.value,
      callData: tx.data,
    }),
  );

  const txHash = await DelegationManager.execute.redeemDelegations({
    client: walletClient,
    delegationManagerAddress: environment.DelegationManager,
    delegations: [[...params.delegations]],
    modes: [ExecutionMode.BatchDefault],
    executions: [executions],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { txHash, receipt };
}
