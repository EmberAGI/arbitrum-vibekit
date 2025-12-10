import { afterEach, describe, expect, it, vi } from 'vitest';

import { deriveMidPrice } from '../core/decision-engine.js';
import type { CamelotPool } from '../domain/types.js';

import {
  EmberCamelotClient,
  fetchPoolSnapshot,
  normalizePool,
  type ClmmRebalanceRequest,
} from './emberApi.js';

const BASE_URL = 'https://unit.test';
const LOG_BASE = Math.log(1.0001);

const partial = <T extends Record<string, unknown>>(value: T): unknown =>
  expect.objectContaining(value) as unknown;

function mockJsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('EmberCamelotClient (unit)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('filters to Camelot Algebra pools and lowercases addresses', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockJsonResponse({
        liquidityPools: [
          {
            identifier: { chainId: '42161', address: '0xABC' },
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xTokenA' },
                name: 'TokenA',
                symbol: 'TK0',
                decimals: 18,
              },
              {
                tokenUid: { chainId: '42161', address: '0xTokenB' },
                name: 'TokenB',
                symbol: 'TK1',
                decimals: 18,
              },
            ],
            price: '1',
            providerId: 'camelot-algebra',
            poolName: 'Algebra Pool',
          },
          {
            identifier: { chainId: '42161', address: '0xDEF' },
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xTokenC' },
                name: 'TokenC',
                symbol: 'TC',
                decimals: 18,
              },
              {
                tokenUid: { chainId: '42161', address: '0xTokenD' },
                name: 'TokenD',
                symbol: 'TD',
                decimals: 18,
              },
            ],
            price: '1',
            providerId: 'other-dex',
            poolName: 'Other Pool',
          },
        ],
        cursor: null,
        currentPage: 1,
        totalPages: 1,
        totalItems: 2,
      }),
    );

    vi.stubGlobal('fetch', fetchSpy);
    const client = new EmberCamelotClient(BASE_URL);

    const pools = await client.listCamelotPools(42161);

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE_URL}/liquidity/pools?chainId=42161`,
      partial({
        headers: partial({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(pools).toHaveLength(1);
    expect(pools[0]?.address).toBe('0xabc');
    expect(pools[0]?.token0.address).toBe('0xtokena');
    expect(pools[0]?.token1.address).toBe('0xtokenb');
  });

  it('converts Ember API token0/token1 quotes into token1/token0 mid prices', async () => {
    const marketPrice = '0.00031296844083452509'; // token0/token1 from Ember
    const fetchSpy = vi.fn().mockResolvedValue(
      mockJsonResponse({
        liquidityPools: [
          {
            identifier: { chainId: '42161', address: '0xPOOL' },
            tokens: [
              {
                tokenUid: { chainId: '42161', address: '0xWETH' },
                name: 'Wrapped ETH',
                symbol: 'WETH',
                decimals: 18,
              },
              {
                tokenUid: { chainId: '42161', address: '0xUSDC' },
                name: 'USDC',
                symbol: 'USDC',
                decimals: 6,
              },
            ],
            price: marketPrice,
            providerId: 'Algebra_camelot',
            poolName: 'lp_WETH-USDC',
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const client = new EmberCamelotClient(BASE_URL);

    const pools = await client.listCamelotPools(42161);

    expect(pools).toHaveLength(1);
    const pool = pools[0];
    expect(pool).toBeDefined();
    if (!pool) {
      throw new Error('Expected Camelot pool in response');
    }
    const midPrice = deriveMidPrice(pool);
    const expected = 1 / Number(marketPrice);
    expect(midPrice).toBeCloseTo(expected, 1);
  });

  it('derives wallet position ticks from price ranges', async () => {
    // Given a wallet position whose Algebra-derived range is already quoted as token1/token0
    const fetchSpy = vi.fn().mockResolvedValue(
      mockJsonResponse({
        positions: [
          {
            poolIdentifier: {
              chainId: '42161',
              address: '0xB1026B8E7276E7AC75410F1FCBBE21796E8F7526',
            },
            operator: '0xdead',
            providerId: 'Algebra_0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B_42161',
            positionRange: { fromPrice: '3090', toPrice: '3105' },
            suppliedTokens: [
              {
                tokenUid: { chainId: '42161', address: '0x82af49447d8a07E3BD95bD0d56f35241523fBab1' },
                name: 'Wrapped ETH',
                symbol: 'WETH',
                decimals: 18,
                amount: '1230000000000000000',
              },
              {
                tokenUid: { chainId: '42161', address: '0xAF88d065e77C8cC2239327c5EDB3A432268e5831' },
                name: 'USD Coin',
                symbol: 'USDC',
                decimals: 6,
                amount: '5000000',
              },
            ],
          },
        ],
        cursor: null,
        currentPage: 1,
        totalPages: 1,
        totalItems: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const client = new EmberCamelotClient(BASE_URL);

    const mockPool: CamelotPool = {
      address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
      token0: {
        address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        symbol: 'WETH',
        decimals: 18,
      },
      token1: {
        address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        symbol: 'USDC',
        decimals: 6,
      },
      tickSpacing: 60,
      tick: -195933,
      liquidity: '1',
    };
    vi.spyOn(client, 'listCamelotPools').mockResolvedValue([mockPool]);

    // When we load wallet positions from the Ember API
    const positions = await client.getWalletPositions('0x1234', 42161);

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE_URL}/liquidity/positions/0x1234?chainId=42161`,
      partial({
        headers: partial({ 'Content-Type': 'application/json' }),
      }),
    );
    // Then the ticks should be computed directly from the provided range without reinverting prices
    expect(positions).toHaveLength(1);
    const [position] = positions;
    const decimalsDiff = mockPool.token0.decimals - mockPool.token1.decimals;
    const priceToTick = (price: number) =>
      Math.round(Math.log(price / Math.pow(10, decimalsDiff)) / LOG_BASE);
    expect(position?.tickLower).toBe(priceToTick(3090));
    expect(position?.tickUpper).toBe(priceToTick(3105));
    expect(position?.suppliedTokens).toEqual([
      {
        tokenAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        symbol: 'WETH',
        decimals: 18,
        amount: '1230000000000000000',
      },
      {
        tokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        symbol: 'USDC',
        decimals: 6,
        amount: '5000000',
      },
    ]);
  });

  it('sends POST payloads for requestRebalance and returns plan transactions', async () => {
    const txPlan = {
      transactions: [
        {
          type: 'EVM_TX',
          to: '0x1',
          data: '0xabc',
          value: '0',
          chainId: '42161',
        },
      ],
      poolIdentifier: { chainId: '42161', address: '0xpool' },
    };
    const fetchSpy = vi.fn().mockResolvedValue(mockJsonResponse(txPlan));
    vi.stubGlobal('fetch', fetchSpy);

    const client = new EmberCamelotClient(BASE_URL);
    const payload: ClmmRebalanceRequest = {
      walletAddress: '0x9999',
      supplyChain: '42161',
      poolIdentifier: { chainId: '42161', address: '0xpool' },
      range: { type: 'full' },
      payableTokens: [
        {
          tokenUid: { chainId: '42161', address: '0xtokena' },
          amount: '1',
        },
      ],
    };

    const plan = await client.requestRebalance(payload);

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE_URL}/liquidity/supply`,
      partial({
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    expect(plan.transactions).toHaveLength(1);
    expect(plan.poolIdentifier?.address).toBe('0xpool');
  });

  it('propagates HTTP failures from requestWithdrawal with the raw body', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(mockJsonResponse({ error: 'Token ID not found' }, { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);

    const client = new EmberCamelotClient(BASE_URL);

    await expect(
      client.requestWithdrawal({
        walletAddress: '0x9999',
        poolTokenUid: { chainId: '42161', address: '0xpool' },
      }),
    ).rejects.toThrow(/500/);

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE_URL}/liquidity/withdraw`,
      partial({
        method: 'POST',
      }),
    );
  });
});

describe('fetchPoolSnapshot + normalizePool helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined when the target pool is absent from the Ember catalog', async () => {
    // Given a client whose list response lacks the requested pool
    const client = new EmberCamelotClient(BASE_URL);
    vi.spyOn(client, 'listCamelotPools').mockResolvedValue([
      {
        address: '0xabc',
        token0: { address: '0x1', symbol: 'A', decimals: 18 },
        token1: { address: '0x2', symbol: 'B', decimals: 18 },
        tickSpacing: 60,
        tick: 0,
        liquidity: '1',
      },
    ]);

    // When fetchPoolSnapshot looks up a different address
    const snapshot = await fetchPoolSnapshot(client, '0x9999', 42161);

    // Then it should return undefined instead of an unrelated pool
    expect(snapshot).toBeUndefined();
  });

  it('normalizePool injects numeric tick spacing, bigint liquidity, and USD defaults', () => {
    // Given a pool payload missing usdPrice metadata
    const normalized = normalizePool({
      address: '0xabc',
      token0: { address: '0x1', symbol: 'A', decimals: 18 },
      token1: { address: '0x2', symbol: 'B', decimals: 6 },
      tickSpacing: undefined as unknown as number,
      tick: 123,
      liquidity: '42',
    });

    // Then normalization should promote strings into durable numeric types
    expect(typeof normalized.tickSpacing).toBe('number');
    expect(normalized.liquidity).toBe(42n);
    expect(normalized.token0Usd).toBe(0);
    expect(normalized.token1Usd).toBe(0);
  });
});
