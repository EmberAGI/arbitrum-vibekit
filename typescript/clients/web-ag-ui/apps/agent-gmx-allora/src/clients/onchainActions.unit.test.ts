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
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'EVM_TX',
                to: '0xrouter',
                data: '0xdeadbeef',
                // Intentionally omit `value` so the client normalizes to "0x0".
                chainId: '42161',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');
    const response = await client.createPerpetualLong({
      amount: '100',
      walletAddress: '0x0000000000000000000000000000000000000001',
      chainId: '42161',
      marketAddress: '0xmarket',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
      leverage: '2',
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.method).toBe('POST');

    const transactions = (response as { transactions?: Array<{ value?: string }> }).transactions;
    expect(transactions?.[0]?.value).toBe('0x0');
  });

  it('posts perpetual close requests', async () => {
    const fetchMock = vi.fn(
      () =>
        new Response(JSON.stringify({ transactions: [] }), {
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

  it('lists perpetual positions across paginated responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            positions: [
              {
                chainId: '42161',
                key: '0xpos1',
                contractKey: '0xcontract',
                account: '0xwallet',
                marketAddress: '0xmarket',
                sizeInUsd: '100',
                sizeInTokens: '0.01',
                collateralAmount: '50',
                pendingBorrowingFeesUsd: '0',
                increasedAtTime: '0',
                decreasedAtTime: '0',
                positionSide: 'long',
                isLong: true,
                fundingFeeAmount: '0',
                claimableLongTokenAmount: '0',
                claimableShortTokenAmount: '0',
                isOpening: false,
                pnl: '0',
                positionFeeAmount: '0',
                traderDiscountAmount: '0',
                uiFeeAmount: '0',
                collateralToken: {
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
            positions: [
              {
                chainId: '42161',
                key: '0xpos2',
                contractKey: '0xcontract',
                account: '0xwallet',
                marketAddress: '0xmarket',
                sizeInUsd: '200',
                sizeInTokens: '0.02',
                collateralAmount: '100',
                pendingBorrowingFeesUsd: '0',
                increasedAtTime: '0',
                decreasedAtTime: '0',
                positionSide: 'short',
                isLong: false,
                fundingFeeAmount: '0',
                claimableLongTokenAmount: '0',
                claimableShortTokenAmount: '0',
                isOpening: false,
                pnl: '0',
                positionFeeAmount: '0',
                traderDiscountAmount: '0',
                uiFeeAmount: '0',
                collateralToken: {
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
    const positions = await client.listPerpetualPositions({
      walletAddress: '0x0000000000000000000000000000000000000001',
      chainIds: ['42161'],
    });

    expect(positions).toHaveLength(2);
    expect(positions[0]?.key).toBe('0xpos1');
    expect(positions[1]?.key).toBe('0xpos2');
  });

  it('raises an error when the API returns a non-200 response', async () => {
    const fetchMock = vi.fn(
      () =>
        new Response('bad request', {
          status: 400,
          headers: { 'Content-Type': 'text/plain' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');

    await expect(
      client.createPerpetualLong({
        amount: '100',
        walletAddress: '0x0000000000000000000000000000000000000001',
        chainId: '42161',
        marketAddress: '0xmarket',
        payTokenAddress: '0xusdc',
        collateralTokenAddress: '0xusdc',
        leverage: '2',
      }),
    ).rejects.toThrow('Onchain actions request failed (400)');
  });
});
