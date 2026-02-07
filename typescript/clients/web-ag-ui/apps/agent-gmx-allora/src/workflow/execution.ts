import type { OnchainClients } from '../clients/clients.js';
import type { OnchainActionsClient, TransactionPlan } from '../clients/onchainActions.js';
import type { ExecutionPlan } from '../core/executionPlan.js';

export type ExecutionResult = {
  action: ExecutionPlan['action'];
  ok: boolean;
  transactions?: TransactionPlan[];
  txHashes?: `0x${string}`[];
  lastTxHash?: `0x${string}`;
  error?: string;
};

type TxSubmissionMode = 'plan' | 'submit';

function normalizeHexAddress(value: string, label: string): `0x${string}` {
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

async function submitTransactions(params: {
  clients: OnchainClients;
  transactions: TransactionPlan[];
}): Promise<{ txHashes: `0x${string}`[]; lastTxHash?: `0x${string}` }> {
  if (params.transactions.length === 0) {
    return { txHashes: [] };
  }

  const txHashes: `0x${string}`[] = [];

  for (const tx of params.transactions) {
    const to = normalizeHexAddress(tx.to, 'transaction target');
    const data = normalizeHexAddress(tx.data, 'transaction data');
    const value = parseTransactionValue(tx.value);

    const hash = await params.clients.wallet.sendTransaction({
      account: params.clients.wallet.account,
      chain: params.clients.wallet.chain,
      to,
      data,
      value,
    });
    await params.clients.public.waitForTransactionReceipt({ hash });
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
  txSubmissionMode?: TxSubmissionMode;
  clients?: OnchainClients;
}): Promise<ExecutionResult> {
  const { plan } = params;
  const txSubmissionMode = params.txSubmissionMode ?? 'plan';

  if (plan.action === 'none' || !plan.request) {
    return { action: plan.action, ok: true };
  }

  try {
    if (plan.action === 'long') {
      const response = await params.client.createPerpetualLong(
        plan.request as Parameters<OnchainActionsClient['createPerpetualLong']>[0],
      );
      const execution =
        txSubmissionMode === 'submit'
          ? params.clients
            ? await submitTransactions({ clients: params.clients, transactions: response.transactions })
            : (() => {
                throw new Error('Onchain clients are required to submit GMX transactions');
              })()
          : undefined;
      return {
        action: plan.action,
        ok: true,
        transactions: response.transactions,
        txHashes: execution?.txHashes,
        lastTxHash: execution?.lastTxHash,
      };
    }
    if (plan.action === 'short') {
      const response = await params.client.createPerpetualShort(
        plan.request as Parameters<OnchainActionsClient['createPerpetualShort']>[0],
      );
      const execution =
        txSubmissionMode === 'submit'
          ? params.clients
            ? await submitTransactions({ clients: params.clients, transactions: response.transactions })
            : (() => {
                throw new Error('Onchain clients are required to submit GMX transactions');
              })()
          : undefined;
      return {
        action: plan.action,
        ok: true,
        transactions: response.transactions,
        txHashes: execution?.txHashes,
        lastTxHash: execution?.lastTxHash,
      };
    }
    const response = await params.client.createPerpetualClose(
      plan.request as Parameters<OnchainActionsClient['createPerpetualClose']>[0],
    );
    if (
      txSubmissionMode === 'submit' &&
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
    const execution =
      txSubmissionMode === 'submit'
        ? params.clients
          ? await submitTransactions({ clients: params.clients, transactions: response.transactions })
          : (() => {
              throw new Error('Onchain clients are required to submit GMX transactions');
            })()
        : undefined;
    return {
      action: plan.action,
      ok: true,
      transactions: response.transactions,
      txHashes: execution?.txHashes,
      lastTxHash: execution?.lastTxHash,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { action: plan.action, ok: false, error: message };
  }
}
