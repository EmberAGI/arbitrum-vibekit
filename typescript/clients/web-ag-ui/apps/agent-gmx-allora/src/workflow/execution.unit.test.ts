import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OnchainClients } from '../clients/clients.js';
import type { ExecutionPlan } from '../core/executionPlan.js';

import type { DelegationBundle } from './context.js';
import { executePerpetualPlan } from './execution.js';

const {
  createSwapMock,
  executeTransactionMock,
  redeemDelegationsAndExecuteTransactionsMock,
} =
  vi.hoisted(() => ({
    createSwapMock: vi.fn(),
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
  createSwap: createSwapMock,
  createPerpetualLong,
  createPerpetualShort,
  createPerpetualClose,
  createPerpetualReduce,
};

const swapFundingEstimate = {
  fromTokenDecimals: 18,
  fromTokenBalanceBaseUnits: '1000000000000000000',
  fromTokenUsdPrice: 1600,
  toTokenDecimals: 6,
  toTokenUsdPrice: 1,
};

describe('executePerpetualPlan', () => {
  beforeEach(() => {
    createPerpetualLong.mockClear();
    createPerpetualShort.mockClear();
    createPerpetualClose.mockClear();
    createPerpetualReduce.mockClear();
    createSwapMock.mockReset();
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

  it('prepends a swap into collateral before opening when pay and collateral tokens differ', async () => {
    createSwapMock.mockResolvedValueOnce({
      exactFromAmount: '5250000000000000',
      exactToAmount: '8000000',
      transactions: [
        {
          type: 'evm',
          to: '0xswap',
          data: '0xswap01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    const plan: ExecutionPlan = {
      action: 'long',
      request: {
        amount: '8000000',
        walletAddress: '0x0000000000000000000000000000000000000001',
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xweth',
        collateralTokenAddress: '0xusdc',
        leverage: '2',
      },
    };

    const result = await executePerpetualPlan({
      client,
      plan,
      txExecutionMode: 'plan',
      delegationsBypassActive: true,
      swapFundingEstimate,
    });

    expect(result.ok).toBe(true);
    expect(createSwapMock).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      amount: '5250000000000000',
      amountType: 'exactIn',
      fromTokenUid: { chainId: '42161', address: '0xweth' },
      toTokenUid: { chainId: '42161', address: '0xusdc' },
    });
    expect(createPerpetualLong).toHaveBeenCalledWith({
      ...plan.request,
      payTokenAddress: '0xusdc',
    });
    expect(result.transactions).toEqual([
      {
        type: 'evm',
        to: '0xswap',
        data: '0xswap01',
        chainId: '42161',
        value: '0',
      },
      {
        type: 'evm',
        to: '0xrouter',
        data: '0xdeadbeef',
        chainId: '42161',
        value: '0',
      },
    ]);
  });

  it('fails safely when a collateral swap is required but no exact-in estimate is available', async () => {
    const plan: ExecutionPlan = {
      action: 'long',
      request: {
        amount: '8000000',
        walletAddress: '0x0000000000000000000000000000000000000001',
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xweth',
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

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unable to estimate exact-in swap amount');
    expect(createSwapMock).not.toHaveBeenCalled();
    expect(createPerpetualLong).not.toHaveBeenCalled();
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

  it('executes flip plans by closing the current side before opening the new side', async () => {
    createPerpetualClose.mockResolvedValueOnce({
      transactions: [
        {
          type: 'evm',
          to: '0xclose',
          data: '0xclose01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    createPerpetualShort.mockResolvedValueOnce({
      transactions: [
        {
          type: 'evm',
          to: '0xopen',
          data: '0xopen01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    const plan: ExecutionPlan = {
      action: 'flip',
      closeRequest: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        marketAddress: '0xmarket',
        positionSide: 'long',
        isLimit: false,
      },
      openRequest: {
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
    expect(createPerpetualClose).toHaveBeenCalledBefore(createPerpetualShort);
    expect(createPerpetualClose).toHaveBeenCalledWith(plan.closeRequest);
    expect(createPerpetualShort).toHaveBeenCalledWith(plan.openRequest);
    expect(result.transactions).toEqual([
      {
        type: 'evm',
        to: '0xclose',
        data: '0xclose01',
        chainId: '42161',
        value: '0',
      },
      {
        type: 'evm',
        to: '0xopen',
        data: '0xopen01',
        chainId: '42161',
        value: '0',
      },
    ]);
  });

  it('inserts a swap between close and reopen transactions for flip plans with non-USDC funding', async () => {
    createPerpetualClose.mockResolvedValueOnce({
      transactions: [
        {
          type: 'evm',
          to: '0xclose',
          data: '0xclose01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    createSwapMock.mockResolvedValueOnce({
      exactFromAmount: '5250000000000000',
      exactToAmount: '8000000',
      transactions: [
        {
          type: 'evm',
          to: '0xswap',
          data: '0xswap02',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    createPerpetualShort.mockResolvedValueOnce({
      transactions: [
        {
          type: 'evm',
          to: '0xopen',
          data: '0xopen01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    const plan: ExecutionPlan = {
      action: 'flip',
      closeRequest: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        marketAddress: '0xmarket',
        positionSide: 'long',
        isLimit: false,
      },
      openRequest: {
        amount: '8000000',
        walletAddress: '0x0000000000000000000000000000000000000001',
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xweth',
        collateralTokenAddress: '0xusdc',
        leverage: '2',
      },
    };

    const result = await executePerpetualPlan({
      client,
      plan,
      txExecutionMode: 'plan',
      delegationsBypassActive: true,
      swapFundingEstimate,
    });

    expect(result.ok).toBe(true);
    expect(createPerpetualClose).toHaveBeenCalledBefore(createSwapMock);
    expect(createSwapMock).toHaveBeenCalledBefore(createPerpetualShort);
    expect(createSwapMock).toHaveBeenCalledWith({
      walletAddress: '0x0000000000000000000000000000000000000001',
      amount: '5250000000000000',
      amountType: 'exactIn',
      fromTokenUid: { chainId: '42161', address: '0xweth' },
      toTokenUid: { chainId: '42161', address: '0xusdc' },
    });
    expect(createPerpetualShort).toHaveBeenCalledWith({
      ...plan.openRequest,
      payTokenAddress: '0xusdc',
    });
    expect(result.transactions).toEqual([
      {
        type: 'evm',
        to: '0xclose',
        data: '0xclose01',
        chainId: '42161',
        value: '0',
      },
      {
        type: 'evm',
        to: '0xswap',
        data: '0xswap02',
        chainId: '42161',
        value: '0',
      },
      {
        type: 'evm',
        to: '0xopen',
        data: '0xopen01',
        chainId: '42161',
        value: '0',
      },
    ]);
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

  it('settles the collateral swap before creating the delegated GMX open plan', async () => {
    createSwapMock.mockResolvedValueOnce({
      exactFromAmount: '5250000000000000',
      exactToAmount: '8000000',
      transactions: [
        {
          type: 'evm',
          to: '0xswap',
          data: '0xswap01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    createPerpetualLong.mockResolvedValueOnce({
      transactions: [
        {
          type: 'evm',
          to: '0xrouter',
          data: '0xopen01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    redeemDelegationsAndExecuteTransactionsMock
      .mockResolvedValueOnce({
        txHashes: ['0xswap-hash'],
        lastTxHash: '0xswap-hash',
      })
      .mockResolvedValueOnce({
        txHashes: ['0xopen-hash'],
        lastTxHash: '0xopen-hash',
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
        amount: '8000000',
        walletAddress: delegationBundle.delegatorAddress,
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xweth',
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
      swapFundingEstimate,
    });

    expect(result.ok).toBe(true);
    expect(redeemDelegationsAndExecuteTransactionsMock).toHaveBeenCalledTimes(2);
    expect(redeemDelegationsAndExecuteTransactionsMock).toHaveBeenNthCalledWith(1, {
      clients,
      delegationBundle,
      transactions: [
        {
          type: 'evm',
          to: '0xswap',
          data: '0xswap01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    expect(redeemDelegationsAndExecuteTransactionsMock).toHaveBeenNthCalledWith(2, {
      clients,
      delegationBundle,
      transactions: [
        {
          type: 'evm',
          to: '0xrouter',
          data: '0xopen01',
          chainId: '42161',
          value: '0',
        },
      ],
    });
    expect(createSwapMock).toHaveBeenCalledBefore(createPerpetualLong);
    expect(
      redeemDelegationsAndExecuteTransactionsMock.mock.invocationCallOrder[0],
    ).toBeLessThan(createPerpetualLong.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY);
    expect(result.txHashes).toEqual(['0xswap-hash', '0xopen-hash']);
    expect(result.lastTxHash).toBe('0xopen-hash');
  });
});
