import type { SendUserOperationParameters } from 'viem/account-abstraction';
import { describe, expect, it, vi } from 'vitest';

import type { OnchainClients } from './clients.js';
import { assertGasBudget, executeTransaction, toWei } from './transaction.js';

const partial = <T extends Record<string, unknown>>(value: T): unknown =>
  expect.objectContaining(value) as unknown;

function makeClients({
  maxFeePerGas,
  sendReceipt,
}: {
  maxFeePerGas: bigint;
  sendReceipt?: string;
}): OnchainClients {
  const receiptHash = sendReceipt ?? '0xtxhash';
  return {
    public: {} as OnchainClients['public'],
    paymaster: { id: 'paymaster' } as unknown as OnchainClients['paymaster'],
    pimlico: {
      getUserOperationGasPrice: vi.fn().mockResolvedValue({
        fast: {
          maxFeePerGas,
          maxPriorityFeePerGas: 1n,
        },
      }),
    } as unknown as OnchainClients['pimlico'],
    bundler: {
      sendUserOperation: vi.fn().mockResolvedValue(receiptHash),
      waitForUserOperationReceipt: vi.fn().mockResolvedValue({
        receipt: { transactionHash: `${receiptHash}-receipt` },
      }),
    } as unknown as OnchainClients['bundler'],
  };
}

describe('executeTransaction', () => {
  it('rejects plans whose estimated gas exceeds the configured budget', async () => {
    // Given Pimlico quotes that imply costs above our 0.0001 ETH budget
    const clients = makeClients({ maxFeePerGas: 1_000_000_000_000n });

    // When executeTransaction evaluates the plan against the tighter cap
    await expect(
      executeTransaction(
        clients,
        { account: {} as never, calls: [] } as SendUserOperationParameters,
        0.0001,
      ),
    ).rejects.toThrow(/exceeds budget/);
  });

  it('forwards successful plans to the bundler and returns the final receipt', async () => {
    // Given a gas quote that sits safely below our max budget
    const clients = makeClients({ maxFeePerGas: 1_000_000_000n, sendReceipt: '0xhash' });
    const parameters = {
      account: { address: '0xaaa' as `0x${string}` },
      calls: [{ to: '0xbbb' as `0x${string}`, data: '0x01' as `0x${string}` }],
    } satisfies {
      account: { address: `0x${string}` };
      calls: Array<{ to: `0x${string}`; data: `0x${string}` }>;
    };

    // When executeTransaction submits the user operation
    const receipt = await executeTransaction(clients, parameters as SendUserOperationParameters, 1);

    // Then it should propagate Pimlico gas quotes and paymaster config to the bundler call
    expect(clients.bundler.sendUserOperation).toHaveBeenCalledWith(
      partial({
        paymaster: clients.paymaster,
        maxFeePerGas: 1_000_000_000n,
        calls: parameters.calls,
      }),
    );
    expect(clients.bundler.waitForUserOperationReceipt).toHaveBeenCalledWith({
      hash: '0xhash',
    });
    expect(receipt.transactionHash).toBe('0xhash-receipt');
  });
});

describe('assertGasBudget', () => {
  it('rejects budgets above the hard-coded protocol ceiling', () => {
    // Given a budget that exceeds MAX_GAS_SPEND_ETH
    expect(() => assertGasBudget(0.1)).toThrow(/exceeds protocol limit/);
  });

  it('rejects zero or negative budgets', () => {
    // Given a budget of zero
    expect(() => assertGasBudget(0)).toThrow(/must be positive/);
  });
});

describe('toWei', () => {
  it('parses floating-point ETH amounts into wei', () => {
    // Given an ETH amount expressed as a number
    const wei = toWei(0.5);

    // Then it should convert the value into wei without rounding surprises
    expect(wei).toBe(500000000000000000n);
  });
});
