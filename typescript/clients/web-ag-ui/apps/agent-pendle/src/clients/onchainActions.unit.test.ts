import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OnchainActionsClient,
  OnchainActionsRequestError,
  TokenizedYieldMarketsResponseSchema,
  TokenizedYieldPositionsResponseSchema,
  WalletBalancesResponseSchema,
  parseTokenizedYieldMarket,
} from './onchainActions.js';

type WalletBalanceFixture = {
  tokenUid: { chainId: string; address: string };
  amount: string;
  symbol?: string;
  valueUsd?: number;
  decimals?: number;
};

const token = (symbol: string) => ({
  tokenUid: { chainId: '42161', address: `0x${symbol.toLowerCase()}` },
  name: symbol,
  symbol,
  isNative: false,
  decimals: 18,
  iconUri: null,
  isVetted: true,
});

describe('onchain actions schemas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses tokenized yield markets response', () => {
    const payload = {
      markets: [
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket' },
          expiry: '2030-01-01',
          details: { aggregatedApy: '7.25' },
          ptToken: token('PT-USDai'),
          ytToken: token('YT-USDai'),
          underlyingToken: token('USDai'),
        },
      ],
      cursor: null,
      currentPage: 1,
      totalPages: 1,
      totalItems: 1,
    };

    const parsed = TokenizedYieldMarketsResponseSchema.parse(payload);
    const markets = parsed.markets.map(parseTokenizedYieldMarket);

    expect(markets).toHaveLength(1);
    expect(markets[0]?.underlyingToken.symbol).toBe('USDai');
  });

  it('parses tokenized yield positions response', () => {
    const payload = {
      positions: [
        {
          marketIdentifier: { chainId: '42161', address: '0xmarket' },
          pt: { token: token('PT-USDai'), exactAmount: '100' },
          yt: {
            token: token('YT-USDai'),
            exactAmount: '5',
            claimableRewards: [{ token: token('ARB'), exactAmount: '0.25' }],
          },
        },
      ],
      cursor: null,
      currentPage: 1,
      totalPages: 1,
      totalItems: 1,
    };

    const parsed = TokenizedYieldPositionsResponseSchema.parse(payload);

    expect(parsed.positions).toHaveLength(1);
    expect(parsed.positions[0]?.yt.claimableRewards).toHaveLength(1);
  });

  it('accepts wallet balances response shape', () => {
    const payload = {
      balances: [
        {
          tokenUid: { chainId: '42161', address: '0xusdai' },
          amount: '100',
          symbol: 'USDai',
          valueUsd: 100,
          decimals: 18,
        } satisfies WalletBalanceFixture,
      ],
      cursor: null,
      currentPage: 1,
      totalPages: 1,
      totalItems: 1,
    };

    expect(() => WalletBalancesResponseSchema.parse(payload)).not.toThrow();
  });

  it('normalizes null iconUri when listing tokens', async () => {
    const fetchMock = vi.fn(() =>
      new Response(
        JSON.stringify({
          tokens: [token('USDC')],
          cursor: null,
          currentPage: 1,
          totalPages: 1,
          totalItems: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');
    const tokens = await client.listTokens();

    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.iconUri).toBeUndefined();
  });

  it('paginates wallet balances until cursor repeats', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xusdai' },
                amount: '100',
                symbol: 'USDai',
                valueUsd: 100,
                decimals: 18,
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
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xusdc' },
                amount: '50',
                symbol: 'USDC',
                valueUsd: 50,
                decimals: 6,
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
    const balances = await client.listWalletBalances('0x0000000000000000000000000000000000000001');

    expect(balances).toHaveLength(2);
    expect(balances[0]?.symbol).toBe('USDai');
    expect(balances[1]?.symbol).toBe('USDC');
  });

  it('throws a request error when the API responds with failure', async () => {
    const fetchMock = vi.fn(() => new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');

    await expect(client.listTokens()).rejects.toBeInstanceOf(OnchainActionsRequestError);
  });

  it('includes optional fields in swap payloads', async () => {
    const fetchMock = vi.fn(() =>
      new Response(
        JSON.stringify({
          exactFromAmount: '100',
          exactToAmount: '99',
          transactions: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new OnchainActionsClient('https://api.example.test');
    await client.createSwap({
      walletAddress: '0x0000000000000000000000000000000000000001',
      amount: '100',
      amountType: 'exactIn',
      fromTokenUid: { chainId: '42161', address: '0xusdai' },
      toTokenUid: { chainId: '42161', address: '0xusdc' },
      slippageTolerance: '0.01',
      expiration: '2026-01-01',
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body =
      requestInit && typeof requestInit.body === 'string'
        ? (JSON.parse(requestInit.body) as Record<string, unknown>)
        : {};

    expect(requestInit?.method).toBe('POST');
    expect(body['slippageTolerance']).toBe('0.01');
    expect(body['expiration']).toBe('2026-01-01');
  });
});
