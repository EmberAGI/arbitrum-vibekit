import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TokenDescriptor } from './types.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('coinGecko helpers', () => {
  it('normalizes CAIP-19 token identifiers', async () => {
    const { toCaip19TokenId } = await import('./coinGecko.js');

    // Given a mixed-case token address
    const caip19 = toCaip19TokenId({ chainId: 42161, address: '0xAbC' });

    // Then the address should be normalized
    expect(caip19).toBe('eip155:42161/erc20:0xabc');
  });

  it('returns the CoinGecko platform id for supported chains', async () => {
    const { resolveCoinGeckoPlatformId } = await import('./coinGecko.js');

    // Given an Arbitrum chain id
    const platform = resolveCoinGeckoPlatformId(42161);

    // Then the platform identifier should be returned
    expect(platform).toBe('arbitrum-one');
    expect(resolveCoinGeckoPlatformId(1)).toBeNull();
  });

  it('fetches token prices and de-duplicates addresses', async () => {
    const { fetchCoinGeckoTokenPrices } = await import('./coinGecko.js');

    // Given a mocked CoinGecko response
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              '0xabc': { usd: 1.25 },
            }),
        }),
      ),
    );

    const tokens: TokenDescriptor[] = [
      { chainId: 42161, address: '0xAbC', symbol: 'AAA', decimals: 18 },
      { chainId: 42161, address: '0xabc', symbol: 'AAA', decimals: 18 },
    ];

    // When fetching prices for duplicate addresses
    const prices = await fetchCoinGeckoTokenPrices({ chainId: 42161, tokens });

    // Then the price map should contain a single entry with normalized address
    expect(prices.size).toBe(1);
    expect(prices.get('eip155:42161/erc20:0xabc')).toEqual({
      tokenAddress: '0xabc',
      usdPrice: 1.25,
      source: 'coingecko',
    });
  });

  it('returns an empty map when the chain is unsupported', async () => {
    const { fetchCoinGeckoTokenPrices } = await import('./coinGecko.js');

    // Given an unsupported chain
    const prices = await fetchCoinGeckoTokenPrices({
      chainId: 1,
      tokens: [{ chainId: 1, address: '0xabc', symbol: 'AAA', decimals: 18 }],
    });

    // Then no prices should be returned
    expect(prices.size).toBe(0);
  });
});
