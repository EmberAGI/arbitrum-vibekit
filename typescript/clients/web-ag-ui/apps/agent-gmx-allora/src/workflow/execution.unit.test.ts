import { describe, expect, it, vi } from 'vitest';

import type { OnchainClients } from '../clients/clients.js';
import type { ExecutionPlan } from '../core/executionPlan.js';

import { executePerpetualPlan } from './execution.js';

const { executeTransactionMock } = vi.hoisted(() => ({
  executeTransactionMock: vi.fn(),
}));

vi.mock('../core/transaction.js', () => ({
  executeTransaction: executeTransactionMock,
}));

const createPerpetualLong = vi.fn(() =>
  Promise.resolve({
    transactions: [
      {
        type: 'evm',
        to: '0xrouter',
        data: '0xdeadbeef',
        chainId: '42161',
        value: '0',
      },
    ],
  }),
);
const createPerpetualShort = vi.fn(() => Promise.resolve({ transactions: [] }));
const createPerpetualClose = vi.fn(() => Promise.resolve({ transactions: [] }));
const createPerpetualReduce = vi.fn(() => Promise.resolve({ transactions: [] }));

const client = {
  createPerpetualLong,
  createPerpetualShort,
  createPerpetualClose,
  createPerpetualReduce,
};

describe('executePerpetualPlan', () => {
  it('skips execution when plan action is none', async () => {
    const plan: ExecutionPlan = { action: 'none' };

    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'plan' });

    expect(result.ok).toBe(true);
    expect(createPerpetualLong).not.toHaveBeenCalled();
    expect(executeTransactionMock).not.toHaveBeenCalled();
  });

  it('executes long plans', async () => {
    const plan: ExecutionPlan = {
      action: 'long',
      request: {
        amount: '100',
        walletAddress: '0x0000000000000000000000000000000000000001',
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xusdc',
        collateralTokenAddress: '0xusdc',
        leverage: '2',
      },
    };

    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'plan' });

    expect(result.ok).toBe(true);
    expect(createPerpetualLong).toHaveBeenCalled();
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions?.[0]?.to).toBe('0xrouter');
    expect(executeTransactionMock).not.toHaveBeenCalled();
  });

  it('executes reduce plans', async () => {
    const plan: ExecutionPlan = {
      action: 'reduce',
      request: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        key: '0xposition',
        sizeDeltaUsd: '1000000000000000000000000000000',
      },
    };

    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'plan' });

    expect(result.ok).toBe(true);
    expect(createPerpetualReduce).toHaveBeenCalled();
    expect(executeTransactionMock).not.toHaveBeenCalled();
  });

  it('captures execution errors', async () => {
    createPerpetualClose.mockRejectedValueOnce(new Error('boom'));
    const plan: ExecutionPlan = {
      action: 'close',
      request: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        marketAddress: '0xmarket',
        positionSide: 'long',
        isLimit: false,
      },
    };

    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'plan' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('submits transactions when tx execution mode is execute', async () => {
    executeTransactionMock.mockResolvedValueOnce({ transactionHash: '0xhash' });
    const clients = {} as OnchainClients;

    const plan: ExecutionPlan = {
      action: 'long',
      request: {
        amount: '100',
        walletAddress: '0x0000000000000000000000000000000000000001',
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xusdc',
        collateralTokenAddress: '0xusdc',
        leverage: '2',
      },
    };

    const result = await executePerpetualPlan({
      client,
      clients,
      plan,
      txExecutionMode: 'execute',
    });

    expect(result.ok).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(executeTransactionMock).toHaveBeenCalledTimes(1);
    expect(result.txHashes).toEqual(['0xhash']);
    expect(result.lastTxHash).toBe('0xhash');
  });
});
