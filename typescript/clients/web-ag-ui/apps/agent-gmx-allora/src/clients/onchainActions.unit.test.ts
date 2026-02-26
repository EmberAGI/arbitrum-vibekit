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

  it('quotes perpetual long requests before posting increase plan endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            asOf: '2026-02-25T00:00:00.000Z',
            ttlMs: 30000,
            precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
            pricing: {
              markPrice: '1',
              acceptablePrice: '1',
              slippageBps: '100',
              priceImpactDeltaUsd: '0',
            },
            fees: { positionFeeUsd: '0', borrowingFeeUsd: '0', fundingFeeUsd: '0' },
            warnings: [],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            transactions: [
              {
                type: 'evm',
                to: '0xrouter',
                data: '0xdeadbeef',
                // Intentionally omit `value` so the client normalizes to "0".
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

    const quoteCall = fetchMock.mock.calls[0] as [unknown, RequestInit | undefined] | undefined;
    const quoteUrl = quoteCall?.[0];
    const quoteRequestInit = quoteCall?.[1];
    expect(quoteUrl).toBe('https://api.example.test/perpetuals/increase/quote');
    expect(quoteRequestInit?.method).toBe('POST');
    expect(JSON.parse((quoteRequestInit?.body as string | undefined) ?? '{}')).toEqual({
      walletAddress: '0x0000000000000000000000000000000000000001',
      providerName: 'GMX Perpetuals',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xusdc',
      side: 'long',
      collateralDeltaAmount: '100',
      sizeDeltaUsd: '200000000000000000000000000',
      slippageBps: '100',
    });

    const planCall = fetchMock.mock.calls[1] as [unknown, RequestInit | undefined] | undefined;
    const planUrl = planCall?.[0];
    const planRequestInit = planCall?.[1];
    expect(planUrl).toBe('https://api.example.test/perpetuals/increase/plan');
    expect(planRequestInit?.method).toBe('POST');
    expect(JSON.parse((planRequestInit?.body as string | undefined) ?? '{}')).toEqual({
      walletAddress: '0x0000000000000000000000000000000000000001',
      providerName: 'GMX Perpetuals',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xusdc',
      side: 'long',
      collateralDeltaAmount: '100',
      sizeDeltaUsd: '200000000000000000000000000',
      slippageBps: '100',
    });

    const transactions = (response as { transactions?: Array<{ value?: string }> }).transactions;
    expect(transactions?.[0]?.value).toBe('0');
  });

  it('quotes perpetual close requests before posting decrease plan endpoint using position lookup', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            positions: [
              {
                chainId: '42161',
                key: '0xposition',
                contractKey: '0xposition',
                account: '0x0000000000000000000000000000000000000001',
                marketAddress: '0xmarket',
                sizeInUsd: '1000000000000000000000000000000',
                sizeInTokens: '1',
                collateralAmount: '100000000',
                pendingBorrowingFeesUsd: '0',
                increasedAtTime: '0',
                decreasedAtTime: '0',
                positionSide: 'long',
                isLong: true,
                fundingFeeAmount: '0',
                claimableLongTokenAmount: '0',
                claimableShortTokenAmount: '0',
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
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            asOf: '2026-02-25T00:00:00.000Z',
            ttlMs: 30000,
            precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
            pricing: {
              markPrice: '1',
              acceptablePrice: '1',
              slippageBps: '100',
              priceImpactDeltaUsd: '0',
            },
            fees: { positionFeeUsd: '0', borrowingFeeUsd: '0', fundingFeeUsd: '0' },
            warnings: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
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

    const lookupCall = fetchMock.mock.calls[0] as [unknown, RequestInit | undefined] | undefined;
    const lookupUrl = lookupCall?.[0];
    expect(lookupUrl).toBe('https://api.example.test/perpetuals/positions/0x0000000000000000000000000000000000000001');

    const quoteCall = fetchMock.mock.calls[1] as [unknown, RequestInit | undefined] | undefined;
    const quoteUrl = quoteCall?.[0];
    const quoteRequestInit = quoteCall?.[1];
    expect(quoteUrl).toBe('https://api.example.test/perpetuals/decrease/quote');
    expect(quoteRequestInit?.method).toBe('POST');
    expect(JSON.parse((quoteRequestInit?.body as string | undefined) ?? '{}')).toEqual({
      walletAddress: '0x0000000000000000000000000000000000000001',
      providerName: 'GMX Perpetuals',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xusdc',
      side: 'long',
      decrease: {
        mode: 'full',
        slippageBps: '100',
      },
    });

    const planCall = fetchMock.mock.calls[2] as [unknown, RequestInit | undefined] | undefined;
    const planUrl = planCall?.[0];
    const planRequestInit = planCall?.[1];
    expect(planUrl).toBe('https://api.example.test/perpetuals/decrease/plan');
    expect(planRequestInit?.method).toBe('POST');
    expect(JSON.parse((planRequestInit?.body as string | undefined) ?? '{}')).toEqual({
      walletAddress: '0x0000000000000000000000000000000000000001',
      providerName: 'GMX Perpetuals',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xusdc',
      side: 'long',
      decrease: {
        mode: 'full',
        slippageBps: '100',
      },
    });
  });

  it('quotes perpetual short requests before posting increase plan endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            asOf: '2026-02-25T00:00:00.000Z',
            ttlMs: 30000,
            precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
            pricing: {
              markPrice: '1',
              acceptablePrice: '1',
              slippageBps: '100',
              priceImpactDeltaUsd: '0',
            },
            fees: { positionFeeUsd: '0', borrowingFeeUsd: '0', fundingFeeUsd: '0' },
            warnings: [],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ transactions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');
    await client.createPerpetualShort({
      amount: '100',
      walletAddress: '0x0000000000000000000000000000000000000001',
      chainId: '42161',
      marketAddress: '0xmarket',
      payTokenAddress: '0xusdc',
      collateralTokenAddress: '0xusdc',
      leverage: '2',
    });

    const quoteCall = fetchMock.mock.calls[0] as [unknown, RequestInit | undefined] | undefined;
    const quoteUrl = quoteCall?.[0];
    const quoteRequestInit = quoteCall?.[1];
    expect(quoteUrl).toBe('https://api.example.test/perpetuals/increase/quote');
    expect(quoteRequestInit?.method).toBe('POST');
    expect(JSON.parse((quoteRequestInit?.body as string | undefined) ?? '{}')).toEqual({
      walletAddress: '0x0000000000000000000000000000000000000001',
      providerName: 'GMX Perpetuals',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xusdc',
      side: 'short',
      collateralDeltaAmount: '100',
      sizeDeltaUsd: '200000000000000000000000000',
      slippageBps: '100',
    });

    const planCall = fetchMock.mock.calls[1] as [unknown, RequestInit | undefined] | undefined;
    const planUrl = planCall?.[0];
    const planRequestInit = planCall?.[1];
    expect(planUrl).toBe('https://api.example.test/perpetuals/increase/plan');
    expect(planRequestInit?.method).toBe('POST');
    expect(JSON.parse((planRequestInit?.body as string | undefined) ?? '{}')).toEqual({
      walletAddress: '0x0000000000000000000000000000000000000001',
      providerName: 'GMX Perpetuals',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xusdc',
      side: 'short',
      collateralDeltaAmount: '100',
      sizeDeltaUsd: '200000000000000000000000000',
      slippageBps: '100',
    });
  });

  it('quotes perpetual reduce requests before posting decrease plan endpoint using position lookup', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            positions: [
              {
                chainId: '42161',
                key: '0xposition',
                contractKey: '0xposition',
                account: '0x0000000000000000000000000000000000000001',
                marketAddress: '0xmarket',
                sizeInUsd: '1000000000000000000000000000000',
                sizeInTokens: '1',
                collateralAmount: '100000000',
                pendingBorrowingFeesUsd: '0',
                increasedAtTime: '0',
                decreasedAtTime: '0',
                positionSide: 'long',
                isLong: true,
                fundingFeeAmount: '0',
                claimableLongTokenAmount: '0',
                claimableShortTokenAmount: '0',
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
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            asOf: '2026-02-25T00:00:00.000Z',
            ttlMs: 30000,
            precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
            pricing: {
              markPrice: '1',
              acceptablePrice: '1',
              slippageBps: '100',
              priceImpactDeltaUsd: '0',
            },
            fees: { positionFeeUsd: '0', borrowingFeeUsd: '0', fundingFeeUsd: '0' },
            warnings: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ transactions: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');
    await client.createPerpetualReduce({
      walletAddress: '0x0000000000000000000000000000000000000001',
      key: '0xposition',
      sizeDeltaUsd: '1000000000000000000000000000000',
    });

    const lookupCall = fetchMock.mock.calls[0] as [unknown, RequestInit | undefined] | undefined;
    const lookupUrl = lookupCall?.[0];
    expect(lookupUrl).toBe('https://api.example.test/perpetuals/positions/0x0000000000000000000000000000000000000001');

    const quoteCall = fetchMock.mock.calls[1] as [unknown, RequestInit | undefined] | undefined;
    const quoteUrl = quoteCall?.[0];
    const quoteRequestInit = quoteCall?.[1];
    expect(quoteUrl).toBe('https://api.example.test/perpetuals/decrease/quote');
    expect(quoteRequestInit?.method).toBe('POST');
    expect(JSON.parse((quoteRequestInit?.body as string | undefined) ?? '{}')).toEqual({
      walletAddress: '0x0000000000000000000000000000000000000001',
      providerName: 'GMX Perpetuals',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xusdc',
      side: 'long',
      decrease: {
        mode: 'partial',
        sizeDeltaUsd: '1000000000000000000000000000000',
        slippageBps: '100',
      },
    });

    const planCall = fetchMock.mock.calls[2] as [unknown, RequestInit | undefined] | undefined;
    const planUrl = planCall?.[0];
    const planRequestInit = planCall?.[1];
    expect(planUrl).toBe('https://api.example.test/perpetuals/decrease/plan');
    expect(planRequestInit?.method).toBe('POST');
    expect(JSON.parse((planRequestInit?.body as string | undefined) ?? '{}')).toEqual({
      walletAddress: '0x0000000000000000000000000000000000000001',
      providerName: 'GMX Perpetuals',
      chainId: '42161',
      marketAddress: '0xmarket',
      collateralTokenAddress: '0xusdc',
      side: 'long',
      decrease: {
        mode: 'partial',
        sizeDeltaUsd: '1000000000000000000000000000000',
        slippageBps: '100',
      },
    });
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
