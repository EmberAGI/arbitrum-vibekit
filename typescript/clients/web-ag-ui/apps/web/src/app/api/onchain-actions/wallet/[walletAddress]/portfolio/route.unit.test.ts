import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { GET } from './route';

describe('/api/onchain-actions/wallet/[walletAddress]/portfolio', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ONCHAIN_ACTIONS_API_URL = 'https://api.example.test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns balances and grouped positions for a wallet', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/wallet/balances/0x1111111111111111111111111111111111111111')) {
        return new Response(
          JSON.stringify({
            balances: [
              {
                tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
                amount: '1000000',
                symbol: 'USDC',
                decimals: 6,
                valueUsd: 1,
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200 },
        );
      }

      if (url.includes('/perpetuals/positions/0x1111111111111111111111111111111111111111')) {
        return new Response(
          JSON.stringify({
            positions: [
              {
                key: 'perp-1',
                marketAddress: '0x47c031236e19d024b42f8AE6780E44A573170703',
                positionSide: 'long',
                sizeInUsd: '1000000000000000000',
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200 },
        );
      }

      if (url.includes('/tokenizedYield/positions/0x1111111111111111111111111111111111111111')) {
        return new Response(
          JSON.stringify({
            positions: [
              {
                marketIdentifier: {
                  chainId: '42161',
                  address: '0x6f9d8ef8fbcf2f3928c1f0f7f53295d85f4cb8d9',
                },
                pt: {
                  token: {
                    tokenUid: {
                      chainId: '42161',
                      address: '0x6f9d8ef8fbcf2f3928c1f0f7f53295d85f4cb8d9',
                    },
                    name: 'Pendle PT',
                    symbol: 'PT',
                    isNative: false,
                    decimals: 18,
                    isVetted: true,
                  },
                  exactAmount: '1',
                },
                yt: {
                  token: {
                    tokenUid: {
                      chainId: '42161',
                      address: '0x6f9d8ef8fbcf2f3928c1f0f7f53295d85f4cb8d9',
                    },
                    name: 'Pendle YT',
                    symbol: 'YT',
                    isNative: false,
                    decimals: 18,
                    isVetted: true,
                  },
                  exactAmount: '1',
                  claimableRewards: [],
                },
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200 },
        );
      }

      if (url.includes('/liquidity/positions/0x1111111111111111111111111111111111111111')) {
        return new Response(
          JSON.stringify({
            positions: [
              {
                positionId: 'clmm-1',
                poolName: 'USDC/WETH',
                positionValueUsd: '500',
                providerId: 'Algebra_0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B_42161',
                pooledTokens: [],
                feesOwedTokens: [],
                rewardsOwedTokens: [],
              },
            ],
            cursor: null,
            currentPage: 1,
            totalPages: 1,
            totalItems: 1,
          }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const request = new Request(
      'http://localhost/api/onchain-actions/wallet/0x1111111111111111111111111111111111111111/portfolio',
    );

    const response = await GET(request, {
      params: Promise.resolve({ walletAddress: '0x1111111111111111111111111111111111111111' }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      walletAddress: string;
      balances: unknown[];
      positions: {
        perpetuals: unknown[];
        pendle: unknown[];
        liquidity: unknown[];
      };
    };

    expect(payload.walletAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(payload.balances).toHaveLength(1);
    expect(payload.positions.perpetuals).toHaveLength(1);
    expect(payload.positions.pendle).toHaveLength(1);
    expect(payload.positions.liquidity).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
