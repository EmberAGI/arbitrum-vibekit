import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CamelotPool } from '../domain/types.js';

import type { TokenDescriptor, TokenPriceQuote } from './types.js';

const fetchCoinGeckoTokenPrices = vi.fn<
  (params: { chainId: number; tokens: TokenDescriptor[] }) => Promise<Map<string, TokenPriceQuote>>
>();

vi.mock('./coinGecko.js', async () => {
  const actual = await vi.importActual('./coinGecko.js');
  return {
    ...(actual as Record<string, unknown>),
    fetchCoinGeckoTokenPrices,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

const pool: CamelotPool = {
  address: '0xpool',
  token0: { address: '0xAAA', symbol: 'AAA', decimals: 18, usdPrice: 2 },
  token1: { address: '0xBBB', symbol: 'BBB', decimals: 6, usdPrice: 3 },
  tickSpacing: 60,
  tick: 0,
  liquidity: '0',
};

describe('deriveTokenPricesFromPools', () => {
  it('emits ember-sourced prices for pools with USD values', async () => {
    const { deriveTokenPricesFromPools } = await import('./pricing.js');

    // Given Camelot pools with USD prices present
    const prices = deriveTokenPricesFromPools([pool], 42161);

    // When deriving prices from the pools
    const token0 = prices.get('eip155:42161/erc20:0xaaa');
    const token1 = prices.get('eip155:42161/erc20:0xbbb');

    // Then both token prices should be emitted from Ember sources
    expect(token0).toEqual({ tokenAddress: '0xaaa', usdPrice: 2, source: 'ember' });
    expect(token1).toEqual({ tokenAddress: '0xbbb', usdPrice: 3, source: 'ember' });
  });
});

describe('resolveTokenPriceMap', () => {
  it('fills missing prices using CoinGecko when Ember is incomplete', async () => {
    const { resolveTokenPriceMap } = await import('./pricing.js');

    // Given pools with one Ember price and one missing token
    fetchCoinGeckoTokenPrices.mockResolvedValue(
      new Map([
        [
          'eip155:42161/erc20:0xccc',
          { tokenAddress: '0xccc', usdPrice: 1.5, source: 'coingecko' },
        ],
      ]),
    );

    const tokens: TokenDescriptor[] = [
      { chainId: 42161, address: '0xAAA', symbol: 'AAA', decimals: 18 },
      { chainId: 42161, address: '0xCCC', symbol: 'CCC', decimals: 18 },
    ];

    // When resolving the token price map
    const priceMap = await resolveTokenPriceMap({
      chainId: 42161,
      pools: [pool],
      tokens,
    });

    // Then CoinGecko should only be used for missing tokens
    expect(fetchCoinGeckoTokenPrices).toHaveBeenCalledTimes(1);
    expect(fetchCoinGeckoTokenPrices).toHaveBeenCalledWith({
      chainId: 42161,
      tokens: [{ chainId: 42161, address: '0xCCC', symbol: 'CCC', decimals: 18 }],
    });
    expect(priceMap.get('eip155:42161/erc20:0xaaa')?.source).toBe('ember');
    expect(priceMap.get('eip155:42161/erc20:0xccc')?.source).toBe('coingecko');
  });

  it('skips CoinGecko when all prices are available from Ember', async () => {
    const { resolveTokenPriceMap } = await import('./pricing.js');

    // Given tokens that already have Ember prices
    const tokens: TokenDescriptor[] = [
      { chainId: 42161, address: '0xAAA', symbol: 'AAA', decimals: 18 },
    ];

    // When resolving the token price map
    await resolveTokenPriceMap({
      chainId: 42161,
      pools: [pool],
      tokens,
    });

    // Then CoinGecko should not be called
    expect(fetchCoinGeckoTokenPrices).not.toHaveBeenCalled();
  });
});
