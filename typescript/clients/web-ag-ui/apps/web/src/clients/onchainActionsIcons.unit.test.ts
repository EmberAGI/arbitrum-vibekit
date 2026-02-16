import { describe, expect, it, vi } from 'vitest';

import {
  fetchOnchainActionsChainsPage,
  fetchOnchainActionsTokensPage,
  type OnchainActionsChainsPage,
  type OnchainActionsTokensPage,
} from './onchainActionsIcons';

describe('onchainActionsIcons client', () => {
  it('parses /chains response (happy path)', async () => {
    const payload: OnchainActionsChainsPage = {
      chains: [
        {
          chainId: '42161',
          type: 'EVM',
          name: 'Arbitrum One',
          iconUri: 'https://example.test/arbitrum.png',
          httpRpcUrl: '',
          blockExplorerUrls: [],
          nativeToken: {
            tokenUid: { chainId: '42161', address: '0x0000000000000000000000000000000000000000' },
            name: 'Ethereum',
            symbol: 'ETH',
            isNative: true,
            decimals: 18,
            iconUri: 'https://example.test/eth.png',
            isVetted: true,
          },
        },
      ],
      cursor: 'cursor-1',
      currentPage: 1,
      totalPages: 1,
      totalItems: 1,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );

    const parsed = await fetchOnchainActionsChainsPage({ baseUrl: 'https://api.example.test', page: 1 });
    expect(parsed.chains[0]?.iconUri).toBe('https://example.test/arbitrum.png');
    expect(parsed.chains[0]?.nativeToken.symbol).toBe('ETH');
  });

  it('parses /tokens response (happy path)', async () => {
    const payload: OnchainActionsTokensPage = {
      tokens: [
        {
          tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          iconUri: 'https://example.test/usdc.png',
          isVetted: true,
        },
      ],
      cursor: 'cursor-1',
      currentPage: 1,
      totalPages: 1,
      totalItems: 1,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );

    const parsed = await fetchOnchainActionsTokensPage({
      baseUrl: 'https://api.example.test',
      chainIds: ['42161'],
      page: 1,
    });
    expect(parsed.tokens[0]?.symbol).toBe('USDC');
    expect(parsed.tokens[0]?.iconUri).toBe('https://example.test/usdc.png');
  });

  it('throws when /chains returns an invalid payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ chains: [{ nope: true }] }), { status: 200 });
      }),
    );

    await expect(
      fetchOnchainActionsChainsPage({ baseUrl: 'https://api.example.test', page: 1 }),
    ).rejects.toThrow();
  });
});

