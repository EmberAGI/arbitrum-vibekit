import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlloraInference } from '../src/clients/allora.js';
import type { PerpetualMarket, PerpetualPosition } from '../src/clients/onchainActions.js';
import type { ClmmState } from '../src/workflow/context.js';
import { pollCycleNode } from '../src/workflow/nodes/pollCycle.js';

const {
  copilotkitEmitStateMock,
  fetchAlloraInferenceMock,
  listPerpetualMarketsMock,
  listPerpetualPositionsMock,
  createPerpetualLongMock,
  createPerpetualShortMock,
  createPerpetualCloseMock,
} = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(async () => undefined),
  fetchAlloraInferenceMock: vi.fn<[], Promise<AlloraInference>>(),
  listPerpetualMarketsMock: vi.fn<[], Promise<PerpetualMarket[]>>(),
  listPerpetualPositionsMock: vi.fn<[], Promise<PerpetualPosition[]>>(),
  createPerpetualLongMock: vi.fn<[], Promise<unknown>>(),
  createPerpetualShortMock: vi.fn<[], Promise<unknown>>(),
  createPerpetualCloseMock: vi.fn<[], Promise<unknown>>(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../src/clients/allora.js', async () => {
  const actual = await vi.importActual<typeof import('../src/clients/allora.js')>(
    '../src/clients/allora.js',
  );
  return {
    ...actual,
    fetchAlloraInference: fetchAlloraInferenceMock,
  };
});

vi.mock('../src/workflow/clientFactory.js', () => ({
  getOnchainActionsClient: () => ({
    listPerpetualMarkets: listPerpetualMarketsMock,
    listPerpetualPositions: listPerpetualPositionsMock,
    createPerpetualLong: createPerpetualLongMock,
    createPerpetualShort: createPerpetualShortMock,
    createPerpetualClose: createPerpetualCloseMock,
  }),
}));

vi.mock('../src/workflow/cronScheduler.js', () => ({
  ensureCronForThread: vi.fn(),
}));

function buildBaseState(): ClmmState {
  return {
    messages: [],
    copilotkit: { actions: [], context: [] },
    settings: { amount: undefined },
    private: {
      mode: undefined,
      pollIntervalMs: 5000,
      streamLimit: -1,
      cronScheduled: false,
      bootstrapped: true,
    },
    view: {
      command: undefined,
      task: undefined,
      poolArtifact: undefined,
      operatorInput: undefined,
      onboarding: undefined,
      fundingTokenInput: undefined,
      selectedPool: {
        address: '0xmarket',
        baseSymbol: 'BTC',
        quoteSymbol: 'USDC',
        token0: { symbol: 'BTC' },
        token1: { symbol: 'USDC' },
        maxLeverage: 2,
      },
      operatorConfig: {
        walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        baseContributionUsd: 200,
        fundingTokenAddress: '0x1111111111111111111111111111111111111111',
        targetMarket: {
          address: '0xmarket',
          baseSymbol: 'BTC',
          quoteSymbol: 'USDC',
          token0: { symbol: 'BTC' },
          token1: { symbol: 'USDC' },
          maxLeverage: 2,
        },
        maxLeverage: 2,
      },
      delegationBundle: undefined,
      haltReason: undefined,
      executionError: undefined,
      delegationsBypassActive: true,
      profile: {
        agentIncome: undefined,
        aum: undefined,
        totalUsers: undefined,
        apy: undefined,
        chains: [],
        protocols: [],
        tokens: [],
        pools: [],
        allowedPools: [],
      },
      activity: { telemetry: [], events: [] },
      metrics: {
        lastSnapshot: undefined,
        previousPrice: undefined,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 0,
        latestCycle: undefined,
      },
      transactionHistory: [],
    },
  };
}

const baseMarket: PerpetualMarket = {
  marketToken: { chainId: '42161', address: '0xmarket' },
  longFundingFee: '0',
  shortFundingFee: '0',
  longBorrowingFee: '0',
  shortBorrowingFee: '0',
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
};

describe('pollCycleNode (integration)', () => {
  beforeEach(() => {
    fetchAlloraInferenceMock.mockReset();
    listPerpetualMarketsMock.mockReset();
    listPerpetualPositionsMock.mockReset();
    createPerpetualLongMock.mockReset();
    createPerpetualShortMock.mockReset();
    createPerpetualCloseMock.mockReset();
    copilotkitEmitStateMock.mockReset();
  });

  it('falls back to cached state when Allora fetch fails transiently', async () => {
    fetchAlloraInferenceMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const state = buildBaseState();
    state.view.metrics.previousPrice = 47000;

    const result = await pollCycleNode(state, {});
    const update = (result as { update: ClmmState }).update;

    expect(update.view?.haltReason).toBeUndefined();
    expect(update.view?.metrics.staleCycles).toBe(1);
    expect(update.view?.metrics.previousPrice).toBe(47000);

    const statusMessages = (update.view?.activity.events ?? [])
      .filter((event) => event.type === 'status')
      .map((event) => event.message);
    expect(statusMessages.join(' ')).toContain('WARNING');
  });

  it('emits telemetry and execution plan artifacts on open action', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([]);

    const state = buildBaseState();
    const result = await pollCycleNode(state, {});

    const update = (result as { update: ClmmState }).update;
    const events = update.view?.activity.events ?? [];
    const artifactIds = events
      .filter((event) => event.type === 'artifact')
      .map((event) => event.artifact.artifactId);

    expect(artifactIds).toContain('gmx-allora-telemetry');
    expect(artifactIds).toContain('gmx-allora-execution-plan');
  });

  it('fails the cycle when no GMX market matches', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([]);
    listPerpetualPositionsMock.mockResolvedValueOnce([]);

    const state = buildBaseState();
    const result = await pollCycleNode(state, {});

    const update = (result as { update: ClmmState }).update;
    expect(update.view?.haltReason).toContain('No GMX');
  });

  it('blocks open trades when exposure exceeds caps', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([
      {
        chainId: '42161',
        key: '0xpos',
        contractKey: '0xcontract',
        account: '0xwallet',
        marketAddress: '0xmarket',
        sizeInUsd: '1000',
        sizeInTokens: '0.02',
        collateralAmount: '500',
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
    ]);

    const state = buildBaseState();
    const result = await pollCycleNode(state, {});

    const update = (result as { update: ClmmState }).update;
    const latestCycle = update.view?.metrics.latestCycle;

    expect(latestCycle?.action).toBe('hold');
    expect(latestCycle?.reason).toContain('Exposure limit');
  });
});
