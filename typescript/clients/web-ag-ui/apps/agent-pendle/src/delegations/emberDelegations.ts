import { z } from 'zod';

import type { TransactionPlan } from '../clients/onchainActions.js';

export const EmberEvmTransactionSchema = z.object({
  type: z.literal('EVM_TX'),
  to: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/u, 'to must be an EVM address')
    .transform((value) => value.toLowerCase() as `0x${string}`),
  data: z
    .string()
    .regex(/^0x[0-9a-fA-F]*$/u, 'data must be 0x-prefixed hex')
    .transform((value) => value.toLowerCase() as `0x${string}`),
  value: z.string().optional(),
  chainId: z.string(),
});
export type EmberEvmTransaction = z.infer<typeof EmberEvmTransactionSchema>;

export type AllowedCalldataPin = {
  startIndex: number;
  value: `0x${string}`;
};

export type NormalizedTransaction = {
  to: `0x${string}`;
  data: `0x${string}`;
  selector: `0x${string}`;
  value: bigint;
  chainId: number;
};

export type DelegationIntent = {
  target: `0x${string}`;
  selector: `0x${string}`;
  allowedCalldata: readonly AllowedCalldataPin[];
};

function deriveSelector(data: `0x${string}`): `0x${string}` {
  if (data.length < 10) {
    return '0x' as `0x${string}`;
  }
  return data.slice(0, 10).toLowerCase() as `0x${string}`;
}

function parseTxValue(value: string | undefined): bigint {
  if (!value) {
    return 0n;
  }
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function normalizeTransactions(params: {
  transactions: readonly TransactionPlan[] | readonly EmberEvmTransaction[];
}): { chainId: number; normalizedTransactions: NormalizedTransaction[] } {
  const emberTxs = z.array(EmberEvmTransactionSchema).parse(params.transactions);
  if (emberTxs.length === 0) {
    throw new Error('No transactions provided');
  }
  const chainId = Number(emberTxs[0]?.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${emberTxs[0]?.chainId ?? ''}`);
  }

  const normalized: NormalizedTransaction[] = emberTxs.map((tx) => {
    const value = parseTxValue(tx.value);
    return {
      to: tx.to,
      data: tx.data,
      selector: deriveSelector(tx.data),
      value,
      chainId,
    };
  });

  return {
    chainId,
    normalizedTransactions: normalized,
  };
}

function calldataMatchesPin(params: { calldata: `0x${string}`; pin: AllowedCalldataPin }): boolean {
  const start = 2 + params.pin.startIndex * 2;
  const end = start + (params.pin.value.length - 2);
  if (start < 2 || end > params.calldata.length) {
    return false;
  }
  const expected = params.pin.value.slice(2).toLowerCase();
  const actual = params.calldata.slice(start, end).toLowerCase();
  return actual === expected;
}

export function txMatchesDelegationIntent(tx: NormalizedTransaction, intent: DelegationIntent): boolean {
  if (tx.to.toLowerCase() !== intent.target.toLowerCase()) {
    return false;
  }
  if (tx.selector.toLowerCase() !== intent.selector.toLowerCase()) {
    return false;
  }
  for (const pin of intent.allowedCalldata) {
    if (!calldataMatchesPin({ calldata: tx.data, pin })) {
      return false;
    }
  }
  return true;
}

