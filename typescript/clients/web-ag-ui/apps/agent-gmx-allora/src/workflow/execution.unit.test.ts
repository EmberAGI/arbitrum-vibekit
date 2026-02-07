import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecutionPlan } from '../core/executionPlan.js';

import { executePerpetualPlan } from './execution.js';

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
  createPerpetualClose,
};

describe('executePerpetualPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits planned transactions when tx submission mode is submit', async () => {
    const sendTransaction = vi.fn(() => Promise.resolve('0xdeadbeef' as const));
    const waitForTransactionReceipt = vi.fn(() =>
      Promise.resolve({ transactionHash: '0xdeadbeef' as const }),
    );

    const plan: ExecutionPlan = {
      action: 'long',
      request: {
        amount: '1000000',
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
      txSubmissionMode: 'submit',
      clients: {
        public: { waitForTransactionReceipt },
        wallet: {
          sendTransaction,
          account: {} as never,
          chain: {} as never,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(sendTransaction).toHaveBeenCalled();
    expect(waitForTransactionReceipt).toHaveBeenCalled();
    expect(result.txHashes?.[0]).toBe('0xdeadbeef');
  });

  it('executes short plans', async () => {
    const plan: ExecutionPlan = {
      action: 'short',
      request: {
        amount: '100',
        walletAddress: '0x0000000000000000000000000000000000000002',
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xusdc',
        collateralTokenAddress: '0xusdc',
        leverage: '2',
      },
    };

    const result = await executePerpetualPlan({ client, plan });

    expect(result.ok).toBe(true);
    expect(createPerpetualShort).toHaveBeenCalledWith(plan.request);
  });

  it('executes close plans', async () => {
    const plan: ExecutionPlan = {
      action: 'close',
      request: {
        walletAddress: '0x0000000000000000000000000000000000000003',
        marketAddress: '0xmarket',
        positionSide: 'short',
        isLimit: false,
      },
    };

    const result = await executePerpetualPlan({ client, plan });

    expect(result.ok).toBe(true);
    expect(createPerpetualClose).toHaveBeenCalledWith(plan.request);
  });

  it('submits close plans when tx submission mode is submit', async () => {
    const sendTransaction = vi.fn(() => Promise.resolve('0xdeadbeef' as const));
    const waitForTransactionReceipt = vi.fn(() =>
      Promise.resolve({ transactionHash: '0xdeadbeef' as const }),
    );

    const plan: ExecutionPlan = {
      action: 'close',
      request: {
        walletAddress: '0x0000000000000000000000000000000000000003',
        marketAddress: '0xmarket',
        positionSide: 'short',
        isLimit: false,
      },
    };

    const result = await executePerpetualPlan({
      client,
      plan,
      txSubmissionMode: 'submit',
      clients: {
        public: { waitForTransactionReceipt },
        wallet: {
          sendTransaction,
          account: {} as never,
          chain: {} as never,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(sendTransaction).toHaveBeenCalled();
    expect(waitForTransactionReceipt).toHaveBeenCalled();
    expect(result.txHashes?.[0]).toBe('0xdeadbeef');
  });

  it('blocks close submission when the planned transactions do not include an execution fee', async () => {
    const sendTransaction = vi.fn(() => Promise.resolve('0xdeadbeef' as const));
    const waitForTransactionReceipt = vi.fn(() =>
      Promise.resolve({ transactionHash: '0xdeadbeef' as const }),
    );

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

    const result = await executePerpetualPlan({
      client,
      plan,
      txSubmissionMode: 'submit',
      clients: {
        public: { waitForTransactionReceipt },
        wallet: {
          sendTransaction,
          account: {} as never,
          chain: {} as never,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/execution fee/i);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it('skips execution when plan action is none', async () => {
    const plan: ExecutionPlan = { action: 'none' };

    const result = await executePerpetualPlan({ client, plan });

    expect(result.ok).toBe(true);
    expect(createPerpetualLong).not.toHaveBeenCalled();
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

    const result = await executePerpetualPlan({ client, plan });

    expect(result.ok).toBe(true);
    expect(createPerpetualLong).toHaveBeenCalled();
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions?.[0]?.to).toBe('0xrouter');
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

    const result = await executePerpetualPlan({ client, plan });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('boom');
  });
});
