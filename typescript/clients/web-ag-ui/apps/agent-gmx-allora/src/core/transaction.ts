import pRetry, { AbortError } from 'p-retry';
import { parseEther } from 'viem';

import type { OnchainClients } from '../clients/clients.js';
import { logInfo } from '../workflow/context.js';

const RPC_RATE_LIMIT_STATUS = 429;
const SEND_TRANSACTION_RETRIES = 5;
const SEND_TRANSACTION_BASE_DELAY_MS = 1000;
const SEND_TRANSACTION_MAX_DELAY_MS = 12000;

function formatRetryError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

function readStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
    return (error as { status: number }).status;
  }
  if (
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object' &&
    (error as { response?: { status?: unknown } }).response?.status !== undefined
  ) {
    const status = (error as { response?: { status?: unknown } }).response?.status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

function isRateLimitError(error: unknown): boolean {
  if (typeof error === 'string') {
    return /Status:\s*429\b/u.test(error) || /"code"\s*:\s*429\b/u.test(error);
  }
  if (error instanceof Error) {
    if (/Status:\s*429\b/u.test(error.message)) {
      return true;
    }
    const status = readStatusCode(error);
    if (status === RPC_RATE_LIMIT_STATUS) {
      return true;
    }
    const cause = (error as { cause?: unknown }).cause;
    if (cause && cause !== error) {
      return isRateLimitError(cause);
    }
  }
  return false;
}

function sendTransactionWithRetry(
  clients: OnchainClients,
  tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
  },
): Promise<`0x${string}`> {
  return pRetry<`0x${string}`>(
    async () =>
      clients.wallet.sendTransaction({
        account: clients.wallet.account,
        chain: clients.wallet.chain,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      }),
    {
      retries: SEND_TRANSACTION_RETRIES,
      factor: 2,
      minTimeout: SEND_TRANSACTION_BASE_DELAY_MS,
      maxTimeout: SEND_TRANSACTION_MAX_DELAY_MS,
      randomize: true,
      onFailedAttempt: ({ attemptNumber, retriesLeft, error }) => {
        if (!isRateLimitError(error)) {
          throw new AbortError(error);
        }
        logInfo('RPC rate limit detected; retrying transaction', {
          attemptNumber,
          retriesLeft,
          error: formatRetryError(error),
        });
      },
    },
  );
}

export async function executeTransaction(
  clients: OnchainClients,
  tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
  },
) {
  const hash = await sendTransactionWithRetry(clients, tx);
  const receipt = await clients.public.waitForTransactionReceipt({ hash });
  return receipt;
}

export function assertGasBudget(maxGasSpendEth: number) {
  if (maxGasSpendEth <= 0) {
    throw new Error('Gas budget must be positive');
  }
}

export function toWei(amountEth: number) {
  return parseEther(amountEth.toString());
}

