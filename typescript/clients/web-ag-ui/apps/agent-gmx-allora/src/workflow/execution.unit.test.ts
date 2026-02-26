import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnchainClients } from '../clients/clients.js';
import type { ExecutionPlan } from '../core/executionPlan.js';

import type { DelegationBundle } from './context.js';
import { executePerpetualPlan } from './execution.js';

const {
  executeTransactionMock,
  redeemDelegationsAndExecuteTransactionsMock,
} =
  vi.hoisted(() => ({
    executeTransactionMock: vi.fn(),
    redeemDelegationsAndExecuteTransactionsMock: vi.fn(),
  }));

vi.mock('../core/transaction.js', () => ({
  executeTransaction: executeTransactionMock,
}));

vi.mock('../core/delegatedExecution.js', () => ({
  redeemDelegationsAndExecuteTransactions: redeemDelegationsAndExecuteTransactionsMock,
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
  beforeEach(() => {
    executeTransactionMock.mockReset();
    redeemDelegationsAndExecuteTransactionsMock.mockReset();
  });

  it('skips execution when plan action is none', async () => {
    const plan: ExecutionPlan = { action: 'none' };

    const result = await executePerpetualPlan({
      client,
      plan,
      txExecutionMode: 'plan',
      delegationsBypassActive: true,
    });

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

    const result = await executePerpetualPlan({
      client,
      plan,
      txExecutionMode: 'plan',
      delegationsBypassActive: true,
    });

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

    const result = await executePerpetualPlan({
      client,
      plan,
      txExecutionMode: 'plan',
      delegationsBypassActive: true,
    });

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

    const result = await executePerpetualPlan({
      client,
      plan,
      txExecutionMode: 'plan',
      delegationsBypassActive: true,
    });

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
      delegationsBypassActive: true,
    });

    expect(result.ok).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(executeTransactionMock).toHaveBeenCalledTimes(1);
    expect(result.txHashes).toEqual(['0xhash']);
    expect(result.lastTxHash).toBe('0xhash');
  });

  it('submits transactions via delegation redemption when delegations are active', async () => {
    redeemDelegationsAndExecuteTransactionsMock.mockResolvedValueOnce({
      txHashes: ['0xhash2'],
      lastTxHash: '0xhash2',
    });
    const clients = {} as OnchainClients;

    const delegationBundle: DelegationBundle = {
      chainId: 42161,
      delegationManager: '0x00000000000000000000000000000000000000aa',
      delegatorAddress: '0x00000000000000000000000000000000000000bb',
      delegateeAddress: '0x00000000000000000000000000000000000000cc',
      delegations: [
        {
          delegate: '0x00000000000000000000000000000000000000cc',
          delegator: '0x00000000000000000000000000000000000000bb',
          authority: `0x${'0'.repeat(64)}`,
          caveats: [],
          salt: `0x${'1'.repeat(64)}`,
          signature: `0x${'2'.repeat(130)}`,
        },
      ],
      intents: [],
      descriptions: [],
      warnings: [],
    };

    const plan: ExecutionPlan = {
      action: 'long',
      request: {
        amount: '100',
        walletAddress: delegationBundle.delegatorAddress,
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
      delegationsBypassActive: false,
      delegationBundle,
      delegatorWalletAddress: delegationBundle.delegatorAddress,
      delegateeWalletAddress: delegationBundle.delegateeAddress,
    });

    expect(result.ok).toBe(true);
    expect(executeTransactionMock).not.toHaveBeenCalled();
    expect(redeemDelegationsAndExecuteTransactionsMock).toHaveBeenCalledTimes(1);
    expect(redeemDelegationsAndExecuteTransactionsMock).toHaveBeenCalledWith({
      clients,
      delegationBundle,
      transactions: [
        {
          type: 'evm',
          to: '0xrouter',
          data: '0xdeadbeef',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    expect(result.txHashes).toEqual(['0xhash2']);
    expect(result.lastTxHash).toBe('0xhash2');
  });
});
