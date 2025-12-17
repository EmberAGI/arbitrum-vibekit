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

import type { NormalizedTransaction, SelectorDiagnostics } from "../delegations/emberDelegations.js";

type RedemptionPlan = {
  delegations: Delegation[];
  mode: ExecutionMode;
  transactions: NormalizedTransaction[];
};

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

function planRedemptionsInTransactionOrder(params: {
  delegations: readonly Delegation[];
  selectorDiagnostics: readonly SelectorDiagnostics[];
  transactions: readonly NormalizedTransaction[];
}): RedemptionPlan[] {
  if (params.delegations.length === 0) {
    throw new Error("No delegations provided for execution");
  }

  if (params.delegations.length === 1) {
    return params.transactions.map((tx) => ({
      delegations: [params.delegations[0]],
      mode: ExecutionMode.SingleDefault,
      transactions: [tx],
    }));
  }

  const targetsByIndex = params.selectorDiagnostics.map((entry) => entry.target.toLowerCase());
  if (targetsByIndex.length !== params.delegations.length) {
    throw new Error(
      `Delegation/diagnostics mismatch (delegations=${params.delegations.length}, diagnostics=${targetsByIndex.length})`,
    );
  }

  const delegationByTarget = new Map<string, Delegation>();
  for (let index = 0; index < targetsByIndex.length; index += 1) {
    const target = targetsByIndex[index];
    const delegation = params.delegations[index];
    if (!delegation) {
      continue;
    }
    delegationByTarget.set(target, delegation);
  }

  return params.transactions.map((tx) => {
    const target = tx.to.toLowerCase();
    const delegation = delegationByTarget.get(target);
    if (!delegation) {
      throw new Error(`No delegation available for target ${target}`);
    }
    return {
      delegations: [delegation],
      mode: ExecutionMode.SingleDefault,
      transactions: [tx],
    };
  });
}

export async function redeemDelegationsAndExecuteTransactions(params: {
  chainId: number;
  rpcUrl: string;
  delegateePrivateKey: `0x${string}`;
  delegations: readonly Delegation[];
  selectorDiagnostics: readonly SelectorDiagnostics[];
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

  const plan = planRedemptionsInTransactionOrder({
    delegations: params.delegations,
    selectorDiagnostics: params.selectorDiagnostics,
    transactions: params.transactions,
  });

  const modes: ExecutionMode[] = [];
  const delegationsBatch: Delegation[][] = [];
  const executionsBatch: ReturnType<typeof createExecution>[][] = [];

  for (const redemption of plan) {
    modes.push(redemption.mode);
    delegationsBatch.push(redemption.delegations);
    executionsBatch.push(
      redemption.transactions.map((tx) =>
        createExecution({
          target: tx.to,
          value: tx.value,
          callData: tx.data,
        }),
      ),
    );
  }

  if (delegationsBatch.length === 0) {
    throw new Error("No redemption batches produced for execution");
  }

  const txHash = await DelegationManager.execute.redeemDelegations({
    client: walletClient,
    delegationManagerAddress: environment.DelegationManager,
    delegations: delegationsBatch,
    modes,
    executions: executionsBatch,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return { txHash, receipt };
}
