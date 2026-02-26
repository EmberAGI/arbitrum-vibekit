import type { OnchainClients } from '../clients/clients.js';
import type { OnchainActionsClient, TransactionPlan } from '../clients/onchainActions.js';
import { redeemDelegationsAndExecuteTransactions } from '../core/delegatedExecution.js';
import type { ExecutionPlan } from '../core/executionPlan.js';
import { executeTransaction } from '../core/transaction.js';

import { logInfo, logWarn, normalizeHexAddress, type DelegationBundle } from './context.js';

export type ExecutionResult = {
  action: ExecutionPlan['action'];
  ok: boolean;
  transactions?: TransactionPlan[];
  txHashes?: `0x${string}`[];
  lastTxHash?: `0x${string}`;
  error?: string;
};

function normalizeHexData(value: string, label: string): `0x${string}` {
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value as `0x${string}`;
}

function parseTransactionValue(value: string | undefined): bigint {
  if (!value) {
    return 0n;
  }
  try {
    return BigInt(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse transaction value "${value}": ${reason}`);
  }
}

async function executePlannedTransaction(params: {
  clients: OnchainClients;
  tx: TransactionPlan;
}): Promise<`0x${string}`> {
  const to = normalizeHexAddress(params.tx.to, 'transaction target');
  const data = normalizeHexData(params.tx.data, 'transaction data');
  const value = parseTransactionValue(params.tx.value);

  logInfo('Submitting GMX planned transaction', {
    to,
    chainId: params.tx.chainId,
    value: params.tx.value,
  });

  const receipt = await executeTransaction(params.clients, { to, data, value });

  logInfo('GMX transaction confirmed', { transactionHash: receipt.transactionHash });

  return receipt.transactionHash;
}

function resolveDelegationExecutionConfig(params: {
  delegationBundle?: DelegationBundle;
  delegatorWalletAddress?: `0x${string}`;
  delegateeWalletAddress?: `0x${string}`;
}): DelegationBundle {
  const bundle = params.delegationBundle;
  if (!bundle) {
    throw new Error(
      'Delegations are required for embedded execution. Complete delegation signing or set DELEGATIONS_BYPASS=true.',
    );
  }

  if (params.delegatorWalletAddress && bundle.delegatorAddress !== params.delegatorWalletAddress) {
    throw new Error(
      `Delegation bundle delegatorAddress (${bundle.delegatorAddress}) does not match operator delegator wallet (${params.delegatorWalletAddress}).`,
    );
  }
  if (params.delegateeWalletAddress && bundle.delegateeAddress !== params.delegateeWalletAddress) {
    throw new Error(
      `Delegation bundle delegateeAddress (${bundle.delegateeAddress}) does not match operator delegatee wallet (${params.delegateeWalletAddress}).`,
    );
  }

  if (bundle.delegations.length === 0) {
    throw new Error(
      'Delegation bundle did not include signed delegations. Complete delegation signing before execution.',
    );
  }

  return {
    ...bundle,
    delegationManager: normalizeHexAddress(bundle.delegationManager, 'delegation manager'),
    delegatorAddress: normalizeHexAddress(bundle.delegatorAddress, 'delegator wallet address'),
    delegateeAddress: normalizeHexAddress(bundle.delegateeAddress, 'delegatee wallet address'),
  };
}

async function planOrExecuteTransactions(params: {
  txExecutionMode: 'plan' | 'execute';
  clients?: OnchainClients;
  transactions: TransactionPlan[];
  delegationBundle?: DelegationBundle;
}): Promise<{ txHashes: `0x${string}`[]; lastTxHash?: `0x${string}` }> {
  if (params.txExecutionMode === 'plan') {
    return { txHashes: [] };
  }
  if (!params.clients) {
    throw new Error('Onchain clients are required to execute GMX transactions');
  }
  if (params.transactions.length === 0) {
    return { txHashes: [] };
  }

  if (params.delegationBundle) {
    const delegationExecution = await redeemDelegationsAndExecuteTransactions({
      clients: params.clients,
      delegationBundle: params.delegationBundle,
      transactions: params.transactions,
    });
    return {
      txHashes: delegationExecution.txHashes,
      lastTxHash: delegationExecution.lastTxHash,
    };
  }

  const txHashes: `0x${string}`[] = [];
  for (const tx of params.transactions) {
    const hash = await executePlannedTransaction({ clients: params.clients, tx });
    txHashes.push(hash);
  }
  return { txHashes, lastTxHash: txHashes.at(-1) };
}

function summarizeExecutionRequest(plan: ExecutionPlan): Record<string, unknown> {
  if (!plan.request || plan.action === 'none') {
    return {};
  }
  if (plan.action === 'long' || plan.action === 'short') {
    const request = plan.request as Parameters<OnchainActionsClient['createPerpetualLong']>[0];
    return {
      walletAddress: request.walletAddress,
      chainId: request.chainId,
      marketAddress: request.marketAddress,
      collateralTokenAddress: request.collateralTokenAddress,
      amount: request.amount,
      leverage: request.leverage,
    };
  }
  if (plan.action === 'close') {
    const request = plan.request as Parameters<OnchainActionsClient['createPerpetualClose']>[0];
    return {
      walletAddress: request.walletAddress,
      marketAddress: request.marketAddress,
      positionSide: request.positionSide,
      isLimit: request.isLimit,
    };
  }
  const request = plan.request as Parameters<OnchainActionsClient['createPerpetualReduce']>[0];
  return {
    walletAddress: request.walletAddress,
    key: request.key,
    sizeDeltaUsd: request.sizeDeltaUsd,
  };
}

function summarizePlannedTransactions(transactions: TransactionPlan[]): Record<string, unknown> {
  const firstTransaction = transactions[0];
  const firstTransactionDataSelector = firstTransaction?.data.startsWith('0x')
    ? firstTransaction.data.slice(0, 10)
    : undefined;
  return {
    transactionCount: transactions.length,
    firstTransactionType: firstTransaction?.type,
    firstTransactionTo: firstTransaction?.to,
    firstTransactionChainId: firstTransaction?.chainId,
    firstTransactionValue: firstTransaction?.value,
    firstTransactionDataSelector,
  };
}

export async function executePerpetualPlan(params: {
  client: Pick<
    OnchainActionsClient,
    'createPerpetualLong' | 'createPerpetualShort' | 'createPerpetualClose' | 'createPerpetualReduce'
  >;
  plan: ExecutionPlan;
  txExecutionMode: 'plan' | 'execute';
  clients?: OnchainClients;
  delegationsBypassActive: boolean;
  delegationBundle?: DelegationBundle;
  delegatorWalletAddress?: `0x${string}`;
  delegateeWalletAddress?: `0x${string}`;
}): Promise<ExecutionResult> {
  const { plan } = params;

  if (plan.action === 'none' || !plan.request) {
    return { action: plan.action, ok: true, txHashes: [] };
  }

  const delegation =
    params.txExecutionMode === 'execute' && params.delegationsBypassActive === false
      ? resolveDelegationExecutionConfig({
          delegationBundle: params.delegationBundle,
          delegatorWalletAddress: params.delegatorWalletAddress,
          delegateeWalletAddress: params.delegateeWalletAddress,
        })
      : undefined;

  const requestSummary = summarizeExecutionRequest(plan);
  logInfo('executePerpetualPlan: creating onchain-actions plan', {
    action: plan.action,
    txExecutionMode: params.txExecutionMode,
    delegationActive: Boolean(delegation),
    ...requestSummary,
  });

  try {
    if (plan.action === 'long') {
      const response = await params.client.createPerpetualLong(
        plan.request as Parameters<OnchainActionsClient['createPerpetualLong']>[0],
      );
      logInfo('executePerpetualPlan: onchain-actions plan received', {
        action: plan.action,
        ...summarizePlannedTransactions(response.transactions),
      });
      const execution = await planOrExecuteTransactions({
        txExecutionMode: params.txExecutionMode,
        clients: params.clients,
        transactions: response.transactions,
        delegationBundle: delegation,
      });
      return {
        action: plan.action,
        ok: true,
        transactions: response.transactions,
        txHashes: execution.txHashes,
        lastTxHash: execution.lastTxHash,
      };
    }
    if (plan.action === 'short') {
      const response = await params.client.createPerpetualShort(
        plan.request as Parameters<OnchainActionsClient['createPerpetualShort']>[0],
      );
      logInfo('executePerpetualPlan: onchain-actions plan received', {
        action: plan.action,
        ...summarizePlannedTransactions(response.transactions),
      });
      const execution = await planOrExecuteTransactions({
        txExecutionMode: params.txExecutionMode,
        clients: params.clients,
        transactions: response.transactions,
        delegationBundle: delegation,
      });
      return {
        action: plan.action,
        ok: true,
        transactions: response.transactions,
        txHashes: execution.txHashes,
        lastTxHash: execution.lastTxHash,
      };
    }
    if (plan.action === 'reduce') {
      const response = await params.client.createPerpetualReduce(
        plan.request as Parameters<OnchainActionsClient['createPerpetualReduce']>[0],
      );
      logInfo('executePerpetualPlan: onchain-actions plan received', {
        action: plan.action,
        ...summarizePlannedTransactions(response.transactions),
      });
      const execution = await planOrExecuteTransactions({
        txExecutionMode: params.txExecutionMode,
        clients: params.clients,
        transactions: response.transactions,
        delegationBundle: delegation,
      });
      return {
        action: plan.action,
        ok: true,
        transactions: response.transactions,
        txHashes: execution.txHashes,
        lastTxHash: execution.lastTxHash,
      };
    }
    const response = await params.client.createPerpetualClose(
      plan.request as Parameters<OnchainActionsClient['createPerpetualClose']>[0],
    );
    logInfo('executePerpetualPlan: onchain-actions plan received', {
      action: plan.action,
      ...summarizePlannedTransactions(response.transactions),
    });
    const execution = await planOrExecuteTransactions({
      txExecutionMode: params.txExecutionMode,
      clients: params.clients,
      transactions: response.transactions,
      delegationBundle: delegation,
    });
    return {
      action: plan.action,
      ok: true,
      transactions: response.transactions,
      txHashes: execution.txHashes,
      lastTxHash: execution.lastTxHash,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn('executePerpetualPlan: failed to create or execute plan', {
      action: plan.action,
      txExecutionMode: params.txExecutionMode,
      delegationActive: Boolean(delegation),
      ...requestSummary,
      error: message,
    });
    return { action: plan.action, ok: false, error: message };
  }
}
