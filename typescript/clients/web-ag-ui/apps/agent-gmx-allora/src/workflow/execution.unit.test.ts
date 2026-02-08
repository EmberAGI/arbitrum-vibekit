import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const createPerpetualShort = vi.fn(() =>
  Promise.resolve({
    transactions: [
      {
        type: 'evm',
        to: '0xrouter',
        data: '0xshort',
        chainId: '42161',
        value: '0',
      },
    ],
  }),
);
const createPerpetualReduce = vi.fn(() =>
  Promise.resolve({
    transactions: [
      {
        type: 'evm',
        to: '0xrouter',
        data: '0xreduce',
        chainId: '42161',
        value: '0',
      },
    ],
  }),
);
const createPerpetualClose = vi.fn(() =>
  Promise.resolve({
    transactions: [
      {
        type: 'evm',
        to: '0xrouter',
        data: '0xclose',
        chainId: '42161',
        value: '1',
      },
    ],
  }),
);

const client = {
  createPerpetualLong,
  createPerpetualShort,
  createPerpetualReduce,
  createPerpetualClose,
};

describe('executePerpetualPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips execution when plan action is none', async () => {
    const plan: ExecutionPlan = { action: 'none' };

    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'plan' });

    expect(result.ok).toBe(true);
    expect(createPerpetualLong).not.toHaveBeenCalled();
    expect(executeTransactionMock).not.toHaveBeenCalled();
  });

  it('returns planned transactions without executing in plan mode', async () => {
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
    expect(result.transactions?.length).toBe(1);
    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(result.txHashes).toEqual([]);
  });

  it('fails in execute mode when onchain clients are missing', async () => {
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

    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'execute' });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/required to execute/i);
  });

  it('submits planned transactions in execute mode', async () => {
    executeTransactionMock.mockResolvedValueOnce({ transactionHash: '0xhash' });

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

    const clients = {} as OnchainClients;
    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'execute', clients });

    expect(result.ok).toBe(true);
    expect(executeTransactionMock).toHaveBeenCalledTimes(1);
    expect(result.txHashes?.[0]).toBe('0xhash');
    expect(result.lastTxHash).toBe('0xhash');
  });

  it('blocks close submission when the planned transactions do not include an execution fee', async () => {
    createPerpetualClose.mockResolvedValueOnce({
      transactions: [
        {
          type: 'evm',
          to: '0xrouter',
          data: '0xclose',
          chainId: '42161',
          value: '0',
        },
      ],
    });

    const plan: ExecutionPlan = {
      action: 'close',
      request: {
        walletAddress: '0x0000000000000000000000000000000000000003',
        marketAddress: '0xmarket',
        positionSide: 'short',
        isLimit: false,
      },
    };

    const clients = {} as OnchainClients;
    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'execute', clients });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/execution fee/i);
    expect(executeTransactionMock).not.toHaveBeenCalled();
  });

  it('executes reduce plans via onchain-actions reduce endpoint', async () => {
    const plan: ExecutionPlan = {
      action: 'reduce',
      request: {
        walletAddress: '0x0000000000000000000000000000000000000003',
        chainId: '42161',
        marketAddress: '0xmarket',
        positionSide: 'long',
        amountUsd: '1',
      },
    };

    const result = await executePerpetualPlan({ client, plan, txExecutionMode: 'plan' });

    expect(result.ok).toBe(true);
    expect(createPerpetualReduce).toHaveBeenCalledWith(plan.request);
  });
});

