import type { Delegation } from '@metamask/delegation-toolkit';
import { erc7710WalletActions } from '@metamask/delegation-toolkit/experimental';
import { encodePermissionContexts } from '@metamask/delegation-toolkit/utils';

import type { OnchainClients } from '../clients/clients.js';
import type { OnchainActionsClient, TransactionPlan } from '../clients/onchainActions.js';
import type { ExecutionPlan } from '../core/executionPlan.js';
import { executeTransaction } from '../core/transaction.js';

import { logInfo, normalizeHexAddress, type DelegationBundle } from './context.js';

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
}): { delegationManager: `0x${string}`; permissionsContext: `0x${string}` } {
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

  const contexts = encodePermissionContexts([bundle.delegations as unknown as Delegation[]]);
  const permissionsContext = contexts[0];
  if (!permissionsContext) {
    throw new Error('Delegation bundle did not produce a permissions context.');
  }

  return {
    delegationManager: normalizeHexAddress(bundle.delegationManager, 'delegation manager'),
    permissionsContext,
  };
}

async function executePlannedTransactionWithDelegation(params: {
  clients: OnchainClients;
  tx: TransactionPlan;
  delegationManager: `0x${string}`;
  permissionsContext: `0x${string}`;
}): Promise<`0x${string}`> {
  const to = normalizeHexAddress(params.tx.to, 'transaction target');
  const data = normalizeHexData(params.tx.data, 'transaction data');
  const value = parseTransactionValue(params.tx.value);

  logInfo('Submitting GMX planned transaction via delegations', {
    to,
    chainId: params.tx.chainId,
    delegationManager: params.delegationManager,
    value: params.tx.value,
  });

  const hash = await erc7710WalletActions()(params.clients.wallet).sendTransactionWithDelegation({
    account: params.clients.wallet.account,
    chain: params.clients.wallet.chain,
    to,
    data,
    value,
    permissionsContext: params.permissionsContext,
    delegationManager: params.delegationManager,
  });

  logInfo('GMX delegated transaction submitted', { transactionHash: hash });

  return hash;
}

async function planOrExecuteTransactions(params: {
  txExecutionMode: 'plan' | 'execute';
  clients?: OnchainClients;
  transactions: TransactionPlan[];
  delegation?: { delegationManager: `0x${string}`; permissionsContext: `0x${string}` };
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
    const hash = params.delegation
      ? await executePlannedTransactionWithDelegation({
          clients: params.clients,
          tx,
          ...params.delegation,
        })
      : await executePlannedTransaction({ clients: params.clients, tx });
    txHashes.push(hash);
  }
  return { txHashes, lastTxHash: txHashes.at(-1) };
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

  try {
    if (plan.action === 'long') {
      const response = await params.client.createPerpetualLong(
        plan.request as Parameters<OnchainActionsClient['createPerpetualLong']>[0],
      );
      const execution = await planOrExecuteTransactions({
        txExecutionMode: params.txExecutionMode,
        clients: params.clients,
        transactions: response.transactions,
        delegation,
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
        delegation,
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
      const execution = await planOrExecuteTransactions({
        txExecutionMode: params.txExecutionMode,
        clients: params.clients,
        transactions: response.transactions,
        delegation,
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
    const execution = await planOrExecuteTransactions({
      txExecutionMode: params.txExecutionMode,
      clients: params.clients,
      transactions: response.transactions,
      delegation,
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
