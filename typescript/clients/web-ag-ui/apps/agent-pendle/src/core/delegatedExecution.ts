import { createExecution, ExecutionMode } from '@metamask/delegation-toolkit';
import { DelegationManager } from '@metamask/delegation-toolkit/contracts';
import { createClient, publicActions, type TransactionReceipt } from 'viem';

import { createRpcTransport, type OnchainClients } from '../clients/clients.js';
import type { TransactionPlan } from '../clients/onchainActions.js';
import { normalizeTransactions, txMatchesDelegationIntent } from '../delegations/emberDelegations.js';
import { logInfo, type DelegationBundle } from '../workflow/context.js';

type Execution = {
  target: `0x${string}`;
  value: bigint;
  callData: `0x${string}`;
};

function assertIsExecution(value: unknown): asserts value is Execution {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Internal error: createExecution returned a non-object');
  }
  if (!('target' in value) || !('value' in value) || !('callData' in value)) {
    throw new Error('Internal error: createExecution returned an unexpected shape');
  }
}

function createExecutionSafe(params: { target: `0x${string}`; value: bigint; callData: `0x${string}` }): Execution {
  const execution: unknown = createExecution(params);
  assertIsExecution(execution);
  return execution;
}

export async function redeemDelegationsAndExecuteTransactions(params: {
  clients: OnchainClients;
  delegationBundle: DelegationBundle;
  transactions: readonly TransactionPlan[];
}): Promise<{ txHashes: `0x${string}`[]; receipts: TransactionReceipt[]; gasSpentWei?: bigint }> {
  if (params.transactions.length === 0) {
    throw new Error('No transactions provided for delegated execution');
  }

  const senderAddress = params.clients.wallet.account.address.toLowerCase() as `0x${string}`;
  const expectedDelegate = params.delegationBundle.delegateeAddress.toLowerCase() as `0x${string}`;

  logInfo('Delegated execution starting', {
    senderAddress,
    expectedDelegate,
    delegatorAddress: params.delegationBundle.delegatorAddress,
    delegationManager: params.delegationBundle.delegationManager,
    transactionCount: params.transactions.length,
  });

  const normalization = normalizeTransactions({ transactions: params.transactions });

  if (normalization.chainId !== params.delegationBundle.chainId) {
    throw new Error(
      `Delegation chainId mismatch (bundle=${params.delegationBundle.chainId}, plan=${normalization.chainId})`,
    );
  }

  const intents = params.delegationBundle.intents.map((intent) => ({
    target: intent.target,
    selector: intent.selector,
    allowedCalldata: intent.allowedCalldata.map((pin) => ({
      startIndex: pin.startIndex,
      value: pin.value,
    })),
  }));

  const canReuseSingleDelegation = params.delegationBundle.delegations.length === 1;

  if (senderAddress !== expectedDelegate) {
    logInfo('Delegated execution sender mismatch (will likely revert InvalidDelegate)', {
      senderAddress,
      expectedDelegate,
    });
  }

  const rpcUrl = (params.clients.public as unknown as { transport?: { url?: unknown } }).transport?.url;
  const resolvedRpcUrl = typeof rpcUrl === 'string' ? rpcUrl : process.env['ARBITRUM_RPC_URL'] ?? 'https://arb1.arbitrum.io/rpc';

  const simulationClient = createClient({
    account: params.clients.wallet.account,
    chain: params.clients.wallet.chain,
    transport: createRpcTransport(resolvedRpcUrl),
  }).extend(publicActions);

  // NOTE: We intentionally execute each transaction as a separate redemption using
  // ExecutionMode.SingleDefault. The FunctionCall caveat enforcer used by MetaMask's
  // delegation-toolkit rejects batch call types for this scope ("invalid-call-type").
  const delegationForIntent = (intentIndex: number) =>
    canReuseSingleDelegation
      ? params.delegationBundle.delegations[0]
      : params.delegationBundle.delegations[intentIndex];

  const txHashes: `0x${string}`[] = [];
  const receipts: TransactionReceipt[] = [];
  let totalGasSpentWei: bigint | undefined;

  logInfo('Delegated execution plan prepared (single-call redemptions)', {
    chainId: normalization.chainId,
    transactionCount: normalization.normalizedTransactions.length,
    expectedDelegate,
    senderAddress,
    canReuseSingleDelegation,
  });

  for (const [txIndex, tx] of normalization.normalizedTransactions.entries()) {
    const intentIndex = intents.findIndex((intent) => txMatchesDelegationIntent(tx, intent));
    if (intentIndex === -1) {
      throw new Error(
        `No delegation intent matched planned call[${txIndex}] (to=${tx.to}, selector=${tx.selector}). Re-run onboarding to sign updated delegations.`,
      );
    }

    const execution = createExecutionSafe({
      target: tx.to,
      value: tx.value,
      callData: tx.data,
    });

    const permissionContexts = [[delegationForIntent(intentIndex)]];
    const modes = [ExecutionMode.SingleDefault];
    const executions = [[execution]];

    const simulation = await DelegationManager.simulate.redeemDelegations({
      client: simulationClient,
      delegationManagerAddress: params.delegationBundle.delegationManager,
      delegations: permissionContexts,
      modes,
      executions,
    });
    const estimatedGasFromSimulation =
      typeof simulation.request.gas === 'bigint' ? simulation.request.gas : undefined;

    const data = DelegationManager.encode.redeemDelegations({
      delegations: permissionContexts,
      modes,
      executions,
    });

    let estimatedGasFromNode: bigint | undefined;
    try {
      estimatedGasFromNode = await params.clients.public.estimateGas({
        account: params.clients.wallet.account,
        to: params.delegationBundle.delegationManager,
        data,
        value: 0n,
      });
    } catch (error) {
      logInfo('Delegated execution gas estimate failed; falling back to simulation estimate', {
        error: error instanceof Error ? error.message : String(error),
        txIndex,
      });
    }

    const baseEstimate =
      estimatedGasFromNode && estimatedGasFromSimulation
        ? estimatedGasFromNode > estimatedGasFromSimulation
          ? estimatedGasFromNode
          : estimatedGasFromSimulation
        : estimatedGasFromNode ?? estimatedGasFromSimulation;
    const gasFloor = 200_000n;
    const bufferedGas = baseEstimate ? (baseEstimate * 3n) / 2n : undefined;
    const gas = bufferedGas ? (bufferedGas > gasFloor ? bufferedGas : gasFloor) : gasFloor;

    logInfo('Delegated execution submitting tx', {
      txIndex,
      to: tx.to,
      selector: tx.selector,
      gas: gas.toString(),
    });

    const txHash = await params.clients.wallet.sendTransaction({
      account: params.clients.wallet.account,
      chain: params.clients.wallet.chain,
      to: params.delegationBundle.delegationManager,
      data,
      value: 0n,
      ...(gas ? { gas } : {}),
    });

    logInfo('Delegated execution tx submitted', {
      txIndex,
      txHash,
    });

    const receipt = await params.clients.public.waitForTransactionReceipt({ hash: txHash });

    logInfo('Delegated execution tx confirmed', {
      txIndex,
      txHash,
      status: receipt.status,
      blockNumber: receipt.blockNumber ? receipt.blockNumber.toString() : undefined,
    });

    txHashes.push(txHash);
    receipts.push(receipt);
    if (receipt.gasUsed !== undefined && receipt.effectiveGasPrice !== undefined) {
      totalGasSpentWei = (totalGasSpentWei ?? 0n) + receipt.gasUsed * receipt.effectiveGasPrice;
    }
  }

  return { txHashes, receipts, gasSpentWei: totalGasSpentWei };
}
