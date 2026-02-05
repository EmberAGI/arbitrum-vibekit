import { describe, expect, it, vi } from 'vitest';

import type { ExecutionPlan } from '../core/executionPlan.js';

import { executePerpetualPlan } from './execution.js';

const createPerpetualLong = vi.fn(() => Promise.resolve(undefined));
const createPerpetualShort = vi.fn(() => Promise.resolve(undefined));
const createPerpetualClose = vi.fn(() => Promise.resolve(undefined));

const client = {
  createPerpetualLong,
  createPerpetualShort,
  createPerpetualClose,
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
        amount: 100n,
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
