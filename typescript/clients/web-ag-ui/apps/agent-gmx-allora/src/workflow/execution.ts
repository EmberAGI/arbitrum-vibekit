import type { OnchainClients } from '../clients/clients.js';
import type { OnchainActionsClient, TransactionPlan } from '../clients/onchainActions.js';
import type { ExecutionPlan } from '../core/executionPlan.js';
import { executeTransaction } from '../core/transaction.js';

import { logInfo, normalizeHexAddress } from './context.js';

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

async function planOrExecuteTransactions(params: {
  txExecutionMode: 'plan' | 'execute';
  clients?: OnchainClients;
  transactions: TransactionPlan[];
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

  const txHashes: `0x${string}`[] = [];
  for (const tx of params.transactions) {
    const hash = await executePlannedTransaction({ clients: params.clients, tx });
    txHashes.push(hash);
  }
  return { txHashes, lastTxHash: txHashes.at(-1) };
}

export async function executePerpetualPlan(params: {
  client: Pick<
    OnchainActionsClient,
    'createPerpetualLong' | 'createPerpetualShort' | 'createPerpetualClose'
  >;
  plan: ExecutionPlan;
  txExecutionMode: 'plan' | 'execute';
  clients?: OnchainClients;
}): Promise<ExecutionResult> {
  const { plan } = params;

  if (plan.action === 'none' || !plan.request) {
    return { action: plan.action, ok: true, txHashes: [] };
  }

  try {
    if (plan.action === 'long') {
      const response = await params.client.createPerpetualLong(
        plan.request as Parameters<OnchainActionsClient['createPerpetualLong']>[0],
      );
      const execution = await planOrExecuteTransactions({
        txExecutionMode: params.txExecutionMode,
        clients: params.clients,
        transactions: response.transactions,
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
      const execution = await planOrExecuteTransactions({
        txExecutionMode: params.txExecutionMode,
        clients: params.clients,
        transactions: response.transactions,
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

    if (
      params.txExecutionMode === 'execute' &&
      response.transactions.every((tx) => parseTransactionValue(tx.value) === 0n)
    ) {
      // A real GMX position close (decrease order) requires a non-zero execution fee. If the
      // plan has no execution fee, it's very likely not a position-close transaction.
      return {
        action: plan.action,
        ok: false,
        transactions: response.transactions,
        error:
          'Close submission is blocked because the planned transactions do not include a GMX execution fee. Ensure onchain-actions is planning a GMX decrease order for close.',
      };
    }

    const execution = await planOrExecuteTransactions({
      txExecutionMode: params.txExecutionMode,
      clients: params.clients,
      transactions: response.transactions,
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
    return { action: plan.action, ok: false, error: message };
  }
}
