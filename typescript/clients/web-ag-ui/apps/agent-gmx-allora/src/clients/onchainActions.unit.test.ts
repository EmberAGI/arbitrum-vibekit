import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnchainActionsClient } from './onchainActions.js';

describe('OnchainActionsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists perpetual markets across paginated responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            markets: [
              {
                marketToken: { chainId: '42161', address: '0xmarket1' },
                longFundingFee: '0.01',
                shortFundingFee: '0.02',
                longBorrowingFee: '0.03',
                shortBorrowingFee: '0.04',
                chainId: '42161',
                name: 'GMX BTC/USD',
                indexToken: {
                  tokenUid: { chainId: '42161', address: '0xbtc' },
                  name: 'Bitcoin',
                  symbol: 'BTC',
                  isNative: false,
                  decimals: 8,
                  iconUri: null,
                  isVetted: true,
                },
                longToken: {
                  tokenUid: { chainId: '42161', address: '0xusdc' },
                  name: 'USD Coin',
                  symbol: 'USDC',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
                shortToken: {
                  tokenUid: { chainId: '42161', address: '0xusdc' },
                  name: 'USD Coin',
                  symbol: 'USDC',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: 'next',
            currentPage: 1,
            totalPages: 2,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            markets: [
              {
                marketToken: { chainId: '42161', address: '0xmarket2' },
                longFundingFee: '0.01',
                shortFundingFee: '0.02',
                longBorrowingFee: '0.03',
                shortBorrowingFee: '0.04',
                chainId: '42161',
                name: 'GMX ETH/USD',
                indexToken: {
                  tokenUid: { chainId: '42161', address: '0xeth' },
                  name: 'Ether',
                  symbol: 'ETH',
                  isNative: false,
                  decimals: 18,
                  iconUri: null,
                  isVetted: true,
                },
                longToken: {
                  tokenUid: { chainId: '42161', address: '0xusdc' },
                  name: 'USD Coin',
                  symbol: 'USDC',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
                shortToken: {
                  tokenUid: { chainId: '42161', address: '0xusdc' },
                  name: 'USD Coin',
                  symbol: 'USDC',
                  isNative: false,
                  decimals: 6,
                  iconUri: null,
                  isVetted: true,
                },
              },
            ],
            cursor: 'next',
            currentPage: 2,
            totalPages: 2,
            totalItems: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');
    const markets = await client.listPerpetualMarkets({ chainIds: ['42161'] });

    expect(markets).toHaveLength(2);
    expect(markets[0]?.name).toBe('GMX BTC/USD');
    expect(markets[1]?.name).toBe('GMX ETH/USD');
  });

  it('posts perpetual long requests', async () => {
    const fetchMock = vi.fn(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');
    await client.createPerpetualLong({
      amount: 100n,
      walletAddress: '0x0000000000000000000000000000000000000001',
      chainId: '42161',
      marketAddress: '0xmarket',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
      leverage: '2',
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.method).toBe('POST');
  });

  it('posts perpetual close requests', async () => {
    const fetchMock = vi.fn(
      () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');
    await client.createPerpetualClose({
      walletAddress: '0x0000000000000000000000000000000000000001',
      marketAddress: '0xmarket',
      positionSide: 'long',
      isLimit: false,
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.method).toBe('POST');
  });
});
