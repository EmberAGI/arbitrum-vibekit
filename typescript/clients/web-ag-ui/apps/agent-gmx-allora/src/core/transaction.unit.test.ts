import { describe, expect, it, vi } from 'vitest';

import type { OnchainClients } from '../clients/clients.js';

import { assertGasBudget, executeTransaction, toWei } from './transaction.js';

const partial = <T extends Record<string, unknown>>(value: T): unknown =>
  expect.objectContaining(value) as unknown;

function makeClients({
  txHash,
  receipt,
}: {
  txHash: `0x${string}`;
  receipt: { transactionHash: `0x${string}` };
}): OnchainClients {
  return {
    public: {
      waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt),
    } as unknown as OnchainClients['public'],
    wallet: {
      account: { address: '0xaaaa' } as `0x${string}`,
      sendTransaction: vi.fn().mockResolvedValue(txHash),
    } as unknown as OnchainClients['wallet'],
  };
}

describe('executeTransaction', () => {
  it('submits transactions via the wallet client and waits for the receipt', async () => {
    const clients = makeClients({
      txHash: '0xhash',
      receipt: { transactionHash: '0xreceipt' as `0x${string}` },
    });

    const receipt = await executeTransaction(clients, {
      to: '0xbbb' as `0x${string}`,
      data: '0x01' as `0x${string}`,
      value: 123n,
    });

    expect(clients.wallet.sendTransaction).toHaveBeenCalledWith(
      partial({
        account: clients.wallet.account,
        to: '0xbbb',
        data: '0x01',
        value: 123n,
      }),
    );
    expect(clients.public.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xhash' });
    expect(receipt.transactionHash).toBe('0xreceipt');
  });
});

describe('assertGasBudget', () => {
  it('rejects zero or negative budgets', () => {
    expect(() => assertGasBudget(0)).toThrow(/must be positive/);
  });
});

describe('toWei', () => {
  it('parses floating-point ETH amounts into wei', () => {
    expect(toWei(0.5)).toBe(500000000000000000n);
  });
});

