import { describe, expect, it, vi } from 'vitest';

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

  it('executes reduce plans', async () => {
    const plan: ExecutionPlan = {
      action: 'reduce',
      request: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        key: '0xposition',
        sizeDeltaUsd: '1000000000000000000000000000000',
      },
    };

    const result = await executePerpetualPlan({ client, plan });

    expect(result.ok).toBe(true);
    expect(createPerpetualReduce).toHaveBeenCalled();
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
