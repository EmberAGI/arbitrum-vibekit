import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EmberCamelotClient,
  type ClmmRebalanceRequest,
} from './emberApi.js';
import type { CamelotPool } from './types.js';

const BASE_URL = 'https://unit.test';

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
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
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
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(pools).toHaveLength(1);
    expect(pools[0]?.address).toBe('0xabc');
    expect(pools[0]?.token0.address).toBe('0xtokena');
    expect(pools[0]?.token1.address).toBe('0xtokenb');
  });

  it('derives wallet position ticks from price ranges', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockJsonResponse({
        positions: [
          {
            poolIdentifier: { chainId: '42161', address: '0xABC' },
            operator: '0xdead',
            providerId: 'camelot',
            positionRange: { fromPrice: '1', toPrice: '4' },
            suppliedTokens: [],
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
      address: '0xabc',
      token0: { address: '0xtokena', symbol: 'TK0', decimals: 18 },
      token1: { address: '0xtokenb', symbol: 'TK1', decimals: 18 },
      tickSpacing: 60,
      tick: 0,
      liquidity: '1',
    };
    vi.spyOn(client, 'listCamelotPools').mockResolvedValue([mockPool]);

    const positions = await client.getWalletPositions('0x1234', 42161);

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BASE_URL}/liquidity/positions/0x1234?chainId=42161`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
    expect(positions).toHaveLength(1);
    const [position] = positions;
    expect(position?.tickLower).toBe(0);
    const expectedUpper = Math.round(Math.log(4) / Math.log(1.0001));
    expect(position?.tickUpper).toBe(expectedUpper);
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
      expect.objectContaining({
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
      .mockResolvedValue(
        mockJsonResponse({ error: 'Token ID not found' }, { status: 500 }),
      );
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
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
