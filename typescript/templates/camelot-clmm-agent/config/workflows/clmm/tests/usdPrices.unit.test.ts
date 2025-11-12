import { describe, expect, it } from 'vitest';

import { enrichCamelotPoolUsdPrices } from '../src/usdPrices.js';
import type { CamelotPool } from '../src/types.js';

const LOG_BASE = Math.log(1.0001);
let poolCounter = 0;

function makePool({
  token0,
  token1,
  ratio,
}: {
  token0: { address: `0x${string}`; symbol: string; decimals: number };
  token1: { address: `0x${string}`; symbol: string; decimals: number };
  ratio: number;
}): CamelotPool {
  const decimalsDiff = token0.decimals - token1.decimals;
  const adjusted = ratio / Math.pow(10, decimalsDiff);
  const tick = Math.round(Math.log(adjusted) / LOG_BASE);

  poolCounter += 1;
  const address = `0x${poolCounter.toString(16).padStart(40, '0')}` as `0x${string}`;

  return {
    address,
    token0: { ...token0 },
    token1: { ...token1 },
    tickSpacing: 60,
    tick,
    liquidity: '1',
  };
}

describe('enrichCamelotPoolUsdPrices', () => {
  it('marks USD stablecoins at $1 even when API omits usdPrice', () => {
    const pools = [
      makePool({
        token0: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6 },
        token1: { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', symbol: 'USDT', decimals: 6 },
        ratio: 1,
      }),
    ];

    // Given a USD stable-to-stable pool with no price metadata attached
    // When the enrichment pass runs against the discovered pool set
    enrichCamelotPoolUsdPrices(pools);

    // Then each stable token should be treated as $1 to unblock downstream sizing
    expect(pools[0].token0.usdPrice).toBe(1);
    expect(pools[0].token1.usdPrice).toBe(1);
  });

  it('derives volatile token price from USD pool ratios', () => {
    const pools = [
      makePool({
        token0: { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'WETH', decimals: 18 },
        token1: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6 },
        ratio: 1800, // token0/token1 ratio == WETH price in USD
      }),
    ];

    // Given a volatile token paired with a USD stable and no prices supplied
    // When enrichment inspects the pool ratios
    enrichCamelotPoolUsdPrices(pools);

    // Then the USD token should remain $1 and the volatile leg should inherit that ratio
    expect(pools[0].token1.usdPrice).toBe(1);
    expect(pools[0].token0.usdPrice).toBeGreaterThan(1799);
    expect(pools[0].token0.usdPrice).toBeLessThan(1801);
  });

  it('derives both sides when either token already has a USD value', () => {
    const pools = [
      makePool({
        token0: { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'WETH', decimals: 18 },
        token1: { address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', symbol: 'USDT', decimals: 6 },
        ratio: 2000,
      }),
      makePool({
        token0: { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', symbol: 'TOKEN-A', decimals: 18 },
        token1: { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', symbol: 'WETH', decimals: 18 },
        ratio: 0.5, // TOKEN-A is worth half a WETH
      }),
    ];

    // Given a price chain where only one token starts with a USD value
    // When enrichment propagates prices across connected pools
    enrichCamelotPoolUsdPrices(pools);

    // Then both tokens in the dependent pool should gain USD valuations derived from neighbors
    expect(pools[1].token0.usdPrice).toBeGreaterThan(999);
    expect(pools[1].token0.usdPrice).toBeLessThan(1001);
    expect(pools[1].token1.usdPrice).toBeGreaterThan(1999);
  });
});
