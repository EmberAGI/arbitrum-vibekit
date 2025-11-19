import { describe, expect, it } from 'vitest';

import type { CamelotPool } from './types.js';
import { enrichCamelotPoolUsdPrices } from './usdPrices.js';

const LOG_BASE = Math.log(1.0001);

function tickFromPrice(price: number, decimalsDiff: number): number {
  if (price <= 0) {
    return 0;
  }
  const adjusted = price / Math.pow(10, decimalsDiff);
  return Math.round(Math.log(adjusted) / LOG_BASE);
}

describe('enrichCamelotPoolUsdPrices', () => {
  it('derives token USD prices using stable counterparts', () => {
    const wethUsd = 1395;
    const token0Decimals = 18;
    const token1Decimals = 6;
    const decimalsDiff = token0Decimals - token1Decimals;
    const pool: CamelotPool = {
      address: '0xpool',
      token0: {
        address: '0xweth',
        symbol: 'WETH',
        decimals: token0Decimals,
      },
      token1: {
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        symbol: 'USDC',
        decimals: token1Decimals,
      },
      tickSpacing: 60,
      tick: tickFromPrice(wethUsd, decimalsDiff),
      liquidity: '0',
    };

    const prices = enrichCamelotPoolUsdPrices([pool]);

    expect(pool.token0.usdPrice).toBeCloseTo(wethUsd, 1);
    expect(prices.get(pool.token0.address)).toBeCloseTo(wethUsd, 1);
    expect(pool.token1.usdPrice).toBe(1);
  });
});
