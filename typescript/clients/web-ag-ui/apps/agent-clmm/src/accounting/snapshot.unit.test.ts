import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EmberCamelotClient } from '../clients/emberApi.js';
import type { CamelotPool, WalletPosition } from '../domain/types.js';

import type { FlowLogEvent, PositionValue } from './types.js';

const computeCamelotPositionValues = vi.fn<
  (params: {
    chainId: number;
    positions: WalletPosition[];
    poolsByAddress: Map<string, CamelotPool>;
    priceMap: Map<string, unknown>;
  }) => PositionValue[]
>();
const resolveTokenPriceMap = vi.fn();

vi.mock('./camelotAdapter.js', () => ({
  CAMELOT_PROTOCOL_ID: 'camelot-clmm',
  computeCamelotPositionValues,
}));

vi.mock('./pricing.js', () => ({
  resolveTokenPriceMap,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function buildClient(params: {
  positions: WalletPosition[];
  pools?: CamelotPool[];
}): { client: EmberCamelotClient; getWalletPositions: ReturnType<typeof vi.fn>; listCamelotPools: ReturnType<typeof vi.fn> } {
  const getWalletPositions = vi.fn(() => Promise.resolve(params.positions));
  const listCamelotPools = vi.fn(() => Promise.resolve(params.pools ?? []));
  return {
    client: {
      getWalletPositions,
      listCamelotPools,
    } as EmberCamelotClient,
    getWalletPositions,
    listCamelotPools,
  };
}

const basePool: CamelotPool = {
  address: '0xpool1',
  token0: { address: '0xtoken0', symbol: 'AAA', decimals: 18 },
  token1: { address: '0xtoken1', symbol: 'BBB', decimals: 6 },
  tickSpacing: 60,
  tick: 0,
  liquidity: '0',
};

const basePosition: WalletPosition = {
  poolAddress: '0xpool1',
  operator: '0xoperator',
  tickLower: 0,
  tickUpper: 10,
  suppliedTokens: [
    { tokenAddress: '0xtoken0', symbol: 'AAA', decimals: 18, amount: '1000000000000000000' },
  ],
};

describe('createCamelotNavSnapshot', () => {
  it('computes fees APY from lifecycle duration', async () => {
    const { createCamelotNavSnapshot } = await import('./snapshot.js');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-11T00:00:00.000Z'));

    const flowLog: FlowLogEvent[] = [
      {
        id: 'flow-1',
        type: 'supply',
        timestamp: '2025-01-01T00:00:00.000Z',
        contextId: 'ctx-1',
        chainId: 42161,
        poolAddress: '0xpool1',
      },
    ];

    const { client } = buildClient({ positions: [basePosition], pools: [basePool] });
    resolveTokenPriceMap.mockResolvedValue(new Map());
    computeCamelotPositionValues.mockReturnValue([
      {
        positionId: 'camelot-0xpool1-0',
        poolAddress: '0xpool1',
        protocolId: 'camelot-clmm',
        tokens: [
          {
            tokenAddress: '0xtoken0',
            symbol: 'AAA',
            decimals: 18,
            category: 'supplied',
            source: 'ember',
          },
        ],
        positionValueUsd: 100,
        feesUsd: 1,
      },
    ]);

    const snapshot = await createCamelotNavSnapshot({
      contextId: 'ctx-1',
      trigger: 'cycle',
      walletAddress: '0xabc',
      chainId: 42161,
      camelotClient: client,
      flowLog,
    });

    expect(snapshot.feesApy).toBeCloseTo(36.5, 6);
    vi.useRealTimers();
  });

  it('returns an empty snapshot when no positions exist', async () => {
    const { createCamelotNavSnapshot } = await import('./snapshot.js');

    // Given a client with no positions
    const { client, listCamelotPools } = buildClient({ positions: [] });

    // When a snapshot is created
    const snapshot = await createCamelotNavSnapshot({
      contextId: 'ctx-1',
      trigger: 'cycle',
      walletAddress: '0xABC',
      chainId: 42161,
      camelotClient: client,
    });

    // Then the snapshot should be zeroed out with unknown pricing
    expect(snapshot.totalUsd).toBe(0);
    expect(snapshot.positions).toEqual([]);
    expect(snapshot.priceSource).toBe('unknown');
    expect(snapshot.walletAddress).toBe('0xabc');
    expect(snapshot.protocolId).toBe('camelot-clmm');

    // And no pricing or pool calls should be made
    expect(listCamelotPools).not.toHaveBeenCalled();
    expect(resolveTokenPriceMap).not.toHaveBeenCalled();
    expect(computeCamelotPositionValues).not.toHaveBeenCalled();
  });

  it('filters positions to managed pools and summarizes price sources', async () => {
    const { createCamelotNavSnapshot } = await import('./snapshot.js');

    // Given wallet positions across multiple pools and a flow log
    const positions: WalletPosition[] = [
      basePosition,
      { ...basePosition, poolAddress: '0xpool2' },
    ];
    const flowLog: FlowLogEvent[] = [
      {
        id: 'flow-1',
        type: 'supply',
        timestamp: '2025-01-01T00:00:00.000Z',
        contextId: 'ctx-1',
        chainId: 42161,
        protocolId: 'camelot-clmm',
        poolAddress: '0xpool1',
      },
    ];

    const { client } = buildClient({ positions, pools: [basePool] });
    resolveTokenPriceMap.mockResolvedValue(new Map());
    computeCamelotPositionValues.mockReturnValue([
      {
        positionId: 'camelot-0xpool1-0',
        poolAddress: '0xpool1',
        protocolId: 'camelot-clmm',
        tokens: [
          {
            tokenAddress: '0xtoken0',
            symbol: 'AAA',
            decimals: 18,
            category: 'supplied',
            source: 'ember',
          },
        ],
        positionValueUsd: 42,
      },
    ]);

    // When a snapshot is created
    const snapshot = await createCamelotNavSnapshot({
      contextId: 'ctx-1',
      trigger: 'cycle',
      walletAddress: '0xabc',
      chainId: 42161,
      camelotClient: client,
      flowLog,
    });

    // Then only managed positions should be valued
    expect(computeCamelotPositionValues).toHaveBeenCalled();
    const call = computeCamelotPositionValues.mock.calls[0]?.[0];
    expect(call?.positions).toHaveLength(1);
    expect(call?.positions[0]?.poolAddress).toBe('0xpool1');

    // And pricing should summarize to the sole source
    expect(snapshot.totalUsd).toBe(42);
    expect(snapshot.priceSource).toBe('ember');
  });

  it('reports mixed pricing sources and aggregates fees/rewards', async () => {
    const { createCamelotNavSnapshot } = await import('./snapshot.js');

    // Given multiple valued positions with fees and rewards
    const { client } = buildClient({ positions: [basePosition], pools: [basePool] });
    resolveTokenPriceMap.mockResolvedValue(new Map());
    computeCamelotPositionValues.mockReturnValue([
      {
        positionId: 'camelot-0xpool1-0',
        poolAddress: '0xpool1',
        protocolId: 'camelot-clmm',
        tokens: [
          {
            tokenAddress: '0xtoken0',
            symbol: 'AAA',
            decimals: 18,
            category: 'supplied',
            source: 'ember',
          },
        ],
        positionValueUsd: 50,
        feesUsd: 1,
      },
      {
        positionId: 'camelot-0xpool1-1',
        poolAddress: '0xpool1',
        protocolId: 'camelot-clmm',
        tokens: [
          {
            tokenAddress: '0xtoken1',
            symbol: 'BBB',
            decimals: 6,
            category: 'supplied',
            source: 'coingecko',
          },
        ],
        positionValueUsd: 25,
        rewardsUsd: 2,
      },
    ]);

    // When a snapshot is created
    const snapshot = await createCamelotNavSnapshot({
      contextId: 'ctx-1',
      trigger: 'cycle',
      walletAddress: '0xabc',
      chainId: 42161,
      camelotClient: client,
    });

    // Then totals and summaries should be aggregated
    expect(snapshot.totalUsd).toBe(75);
    expect(snapshot.feesUsd).toBe(1);
    expect(snapshot.rewardsUsd).toBe(2);
    expect(snapshot.priceSource).toBe('mixed');
  });
});
