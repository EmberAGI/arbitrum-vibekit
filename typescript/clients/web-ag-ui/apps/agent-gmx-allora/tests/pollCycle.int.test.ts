import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlloraInference } from '../src/clients/allora.js';
import type { PerpetualMarket, PerpetualPosition } from '../src/clients/onchainActions.js';
import { ONCHAIN_ACTIONS_API_URL } from '../src/config/constants.js';
import type { ClmmState } from '../src/workflow/context.js';
import { pollCycleNode } from '../src/workflow/nodes/pollCycle.js';

type PollCycleUpdate = {
  view?: ClmmState['view'];
  private?: ClmmState['private'];
};

function extractPollCycleUpdate(result: unknown): PollCycleUpdate {
  if (
    typeof result === 'object' &&
    result !== null &&
    'update' in result &&
    typeof (result as { update?: unknown }).update === 'object'
  ) {
    return (result as { update: PollCycleUpdate }).update;
  }
  return result as PollCycleUpdate;
}

const {
  copilotkitEmitStateMock,
  fetchAlloraInferenceMock,
  listPerpetualMarketsMock,
  listPerpetualPositionsMock,
  createPerpetualLongMock,
  createPerpetualShortMock,
  createPerpetualCloseMock,
  createPerpetualReduceMock,
  getPerpetualLifecycleMock,
  getOnchainClientsMock,
} = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(async () => undefined),
  fetchAlloraInferenceMock: vi.fn<[], Promise<AlloraInference>>(),
  listPerpetualMarketsMock: vi.fn<[], Promise<PerpetualMarket[]>>(),
  listPerpetualPositionsMock: vi.fn<[], Promise<PerpetualPosition[]>>(),
  createPerpetualLongMock: vi.fn<[], Promise<unknown>>(),
  createPerpetualShortMock: vi.fn<[], Promise<unknown>>(),
  createPerpetualCloseMock: vi.fn<[], Promise<unknown>>(),
  createPerpetualReduceMock: vi.fn<[], Promise<unknown>>(),
  getPerpetualLifecycleMock: vi.fn<[], Promise<unknown>>(),
  getOnchainClientsMock: vi.fn(),
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
    createPerpetualReduce: createPerpetualReduceMock,
    getPerpetualLifecycle: getPerpetualLifecycleMock,
  }),
  getOnchainClients: getOnchainClientsMock,
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
        delegatorWalletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        delegateeWalletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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

const approvalOnlyTransaction = {
  type: 'transaction',
  to: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
  data: '0x095ea7b30000000000000000000000001111111111111111111111111111111111111111',
  value: '0',
  chainId: '42161',
};

describe('pollCycleNode (integration)', () => {
  beforeEach(() => {
    fetchAlloraInferenceMock.mockReset();
    listPerpetualMarketsMock.mockReset();
    listPerpetualPositionsMock.mockReset();
    createPerpetualLongMock.mockReset();
    createPerpetualShortMock.mockReset();
    createPerpetualCloseMock.mockReset();
    createPerpetualReduceMock.mockReset();
    getPerpetualLifecycleMock.mockReset();
    getOnchainClientsMock.mockReset();
    copilotkitEmitStateMock.mockReset();
  });

  it('falls back to cached state when Allora fetch fails transiently', async () => {
    fetchAlloraInferenceMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const state = buildBaseState();
    state.view.metrics.previousPrice = 47000;

    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);

    expect(update.view?.haltReason).toBeUndefined();
    expect(update.view?.metrics.staleCycles).toBe(1);
    expect(update.view?.metrics.previousPrice).toBe(47000);

    const statusMessages = (update.view?.activity.events ?? [])
      .filter((event) => event.type === 'status')
      .map((event) => event.message);
    expect(statusMessages.join(' ')).toContain('WARNING');
  });

  it('surfaces onchain-actions endpoint in GMX markets/positions fetch failures', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const state = buildBaseState();
    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);

    expect(update.view?.haltReason).toContain(
      `ERROR: Failed to fetch GMX markets/positions from ${ONCHAIN_ACTIONS_API_URL}`,
    );
    expect(update.view?.haltReason).toContain('fetch failed');
  });

  it('shows actionable guidance when GMX order simulation fails', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([]);
    createPerpetualLongMock.mockRejectedValueOnce(
      new Error('Onchain actions request failed (500): {"error":"Error: Execute order simulation failed"}'),
    );

    const state = buildBaseState();
    state.view.metrics.previousPrice = 46000;
    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);

    expect(update.view?.haltReason).toBe('');
    expect(update.view?.task?.taskStatus.state).toBe('input-required');
    expect(update.view?.task?.taskStatus.message?.content).toContain(
      'GMX order simulation failed',
    );
    expect(update.view?.task?.taskStatus.message?.content).toContain(
      'enough USDC collateral and a small amount of Arbitrum ETH',
    );
    expect(update.view?.task?.taskStatus.message?.content).toContain(
      'click Continue in Agent Blockers',
    );
    expect(update.view?.task?.taskStatus.message?.content).not.toContain('{"command":"cycle"}');
    expect(update.view?.executionError).toBe('');
    expect(update.view?.transactionHistory).toHaveLength(0);

    const executionResultArtifact = (update.view?.activity.events ?? []).find(
      (event) => event.type === 'artifact' && event.artifact.artifactId === 'gmx-allora-execution-result',
    )?.artifact;
    const executionData = executionResultArtifact?.parts.find((part) => part.kind === 'data');
    expect(executionData?.kind).toBe('data');
    expect(executionData?.data).toMatchObject({ ok: false, status: 'blocked' });
    expect((executionData?.data as { error?: string }).error).toBeUndefined();
  });

  it('emits telemetry and execution plan artifacts on open action', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([]);
    createPerpetualLongMock.mockResolvedValueOnce({ transactions: [] });

    const state = buildBaseState();
    state.view.metrics.previousPrice = 46000;
    const result = await pollCycleNode(state, {});

    const update = extractPollCycleUpdate(result);
    const events = update.view?.activity.events ?? [];
    const artifactIds = events
      .filter((event) => event.type === 'artifact')
      .map((event) => event.artifact.artifactId);

    expect(artifactIds).toContain('gmx-allora-telemetry');
    expect(artifactIds).toContain('gmx-allora-execution-plan');
    expect(update.view?.metrics.latestSnapshot?.totalUsd).toBeGreaterThan(0);
  });

  it('fails cycle execution when perpetual lifecycle reports cancelled status for submitted open order', async () => {
    const originalTxExecutionMode = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
    try {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = 'execute';

      fetchAlloraInferenceMock.mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      });
      listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
      listPerpetualPositionsMock.mockResolvedValueOnce([]);
      createPerpetualLongMock.mockResolvedValueOnce({
        transactions: [{ type: 'evm', to: '0x1', data: '0x2', value: '0', chainId: '42161' }],
      });
      getPerpetualLifecycleMock.mockResolvedValueOnce({
        providerName: 'GMX Perpetuals',
        chainId: '42161',
        txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        orderKey: '0x2222222222222222222222222222222222222222222222222222222222222222',
        status: 'cancelled',
        reason: 'OrderNotFulfillableAtAcceptablePrice',
        precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
        asOf: '2026-01-01T00:00:00.000Z',
      });
      getOnchainClientsMock.mockReturnValue({
        wallet: {
          account: { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          chain: { id: 42161 },
          sendTransaction: vi
            .fn()
            .mockResolvedValue('0x1111111111111111111111111111111111111111111111111111111111111111'),
        },
        public: {
          waitForTransactionReceipt: vi.fn().mockResolvedValue({
            status: 'success',
            transactionHash:
              '0x1111111111111111111111111111111111111111111111111111111111111111',
          }),
        },
      });

      const state = buildBaseState();
      state.view.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(getPerpetualLifecycleMock).toHaveBeenCalledWith({
        providerName: 'GMX Perpetuals',
        chainId: '42161',
        txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });
      expect(update.view?.task?.taskStatus.state).toBe('working');
      expect(update.view?.task?.taskStatus.message?.content).toContain('execution failed');
      expect(update.view?.task?.taskStatus.message?.content).toContain('cancelled');
      expect(update.view?.executionError).toContain('cancelled');
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
  });

  it('routes open long decisions to createPerpetualLong', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([]);

    const state = buildBaseState();
    state.view.metrics.previousPrice = 46000;
    await pollCycleNode(state, {});

    expect(createPerpetualLongMock).toHaveBeenCalledTimes(1);
    expect(createPerpetualShortMock).not.toHaveBeenCalled();
    expect(createPerpetualCloseMock).not.toHaveBeenCalled();
    expect(createPerpetualReduceMock).not.toHaveBeenCalled();
  });

  it('routes open short decisions to createPerpetualShort', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([]);

    const state = buildBaseState();
    state.view.metrics.previousPrice = 48000;
    await pollCycleNode(state, {});

    expect(createPerpetualShortMock).toHaveBeenCalledTimes(1);
    expect(createPerpetualLongMock).not.toHaveBeenCalled();
    expect(createPerpetualCloseMock).not.toHaveBeenCalled();
    expect(createPerpetualReduceMock).not.toHaveBeenCalled();
  });

  it('routes direction-flip decisions to createPerpetualClose', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([]);

    const state = buildBaseState();
    state.view.metrics.previousPrice = 48000;
    state.view.metrics.assumedPositionSide = 'long';
    await pollCycleNode(state, {});

    expect(createPerpetualCloseMock).toHaveBeenCalledTimes(1);
    expect(createPerpetualLongMock).not.toHaveBeenCalled();
    expect(createPerpetualShortMock).not.toHaveBeenCalled();
    expect(createPerpetualReduceMock).not.toHaveBeenCalled();
  });

  it('skips a second trade when inference metrics are unchanged', async () => {
    fetchAlloraInferenceMock
      .mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      })
      .mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      });
    listPerpetualMarketsMock.mockResolvedValue([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValue([]);

    const firstState = buildBaseState();
    firstState.view.metrics.previousPrice = 48000;
    firstState.view.metrics.assumedPositionSide = 'long';
    const firstResult = await pollCycleNode(firstState, {});

    const firstUpdate = extractPollCycleUpdate(firstResult);

    const secondState = buildBaseState();
    secondState.view.metrics = {
      ...secondState.view.metrics,
      ...(firstUpdate.view?.metrics ?? {}),
    };
    secondState.view.metrics.assumedPositionSide = firstUpdate.view?.metrics?.assumedPositionSide;
    secondState.view.metrics.latestCycle = firstUpdate.view?.metrics?.latestCycle;
    secondState.view.metrics.previousPrice = firstUpdate.view?.metrics?.previousPrice;
    secondState.view.metrics.cyclesSinceRebalance = 3;

    await pollCycleNode(secondState, {});

    expect(createPerpetualCloseMock).toHaveBeenCalledTimes(1);
  });

  it('allows a second trade when inference metrics change', async () => {
    const openLongPosition: PerpetualPosition = {
      chainId: '42161',
      key: '0xpos-open-long',
      contractKey: '0xposition-open-long',
      account: '0xwallet',
      marketAddress: '0xmarket',
      sizeInUsd: '16000000000000000000000000000000',
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
    };
    fetchAlloraInferenceMock
      .mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      })
      .mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 45000,
        confidenceIntervalValues: [44000, 44500, 45000, 45500, 46000],
      });
    listPerpetualMarketsMock.mockResolvedValue([baseMarket]);
    listPerpetualPositionsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([openLongPosition])
      .mockResolvedValueOnce([openLongPosition])
      .mockResolvedValueOnce([]);
    createPerpetualLongMock.mockResolvedValueOnce({ transactions: [] });
    createPerpetualCloseMock.mockResolvedValueOnce({ transactions: [] });

    const firstState = buildBaseState();
    firstState.view.metrics.previousPrice = 46000;
    const firstResult = await pollCycleNode(firstState, {});

    const firstUpdate = extractPollCycleUpdate(firstResult);

    const secondState = buildBaseState();
    secondState.view.metrics = {
      ...secondState.view.metrics,
      ...(firstUpdate.view?.metrics ?? {}),
    };
    secondState.view.metrics.assumedPositionSide = firstUpdate.view?.metrics?.assumedPositionSide;
    secondState.view.metrics.latestCycle = firstUpdate.view?.metrics?.latestCycle;
    secondState.view.metrics.previousPrice = firstUpdate.view?.metrics?.previousPrice;
    secondState.view.metrics.cyclesSinceRebalance = 3;

    await pollCycleNode(secondState, {});

    expect(createPerpetualLongMock).toHaveBeenCalledTimes(1);
    expect(createPerpetualCloseMock).toHaveBeenCalledTimes(1);
  });

  it('retries open trades when the prior cycle only submitted approval transactions', async () => {
    fetchAlloraInferenceMock
      .mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      })
      .mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      });
    listPerpetualMarketsMock.mockResolvedValue([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValue([]);
    createPerpetualLongMock.mockResolvedValue({ transactions: [approvalOnlyTransaction] });

    const firstState = buildBaseState();
    firstState.view.metrics.previousPrice = 46000;
    const firstResult = await pollCycleNode(firstState, {});

    const firstUpdate = extractPollCycleUpdate(firstResult);

    const secondState = buildBaseState();
    secondState.view.metrics = {
      ...secondState.view.metrics,
      ...(firstUpdate.view?.metrics ?? {}),
    };
    secondState.view.metrics.latestCycle = firstUpdate.view?.metrics?.latestCycle;
    secondState.view.metrics.previousPrice = firstUpdate.view?.metrics?.previousPrice;

    await pollCycleNode(secondState, {});

    expect(createPerpetualLongMock).toHaveBeenCalledTimes(2);
  });

  it('clears stale position snapshot when no fresh position snapshot is available', async () => {
    fetchAlloraInferenceMock
      .mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      })
      .mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      });
    listPerpetualMarketsMock.mockResolvedValue([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValue([]);
    createPerpetualLongMock.mockResolvedValueOnce({ transactions: [] });

    const firstState = buildBaseState();
    firstState.view.metrics.previousPrice = 46000;
    const firstResult = await pollCycleNode(firstState, {});
    const firstUpdate = extractPollCycleUpdate(firstResult);
    const firstSnapshot = firstUpdate.view?.metrics.latestSnapshot;
    expect(firstSnapshot?.totalUsd).toBeGreaterThan(0);

    const secondState = buildBaseState();
    secondState.view.metrics = {
      ...secondState.view.metrics,
      ...(firstUpdate.view?.metrics ?? {}),
    };
    secondState.view.metrics.assumedPositionSide = firstUpdate.view?.metrics.assumedPositionSide;
    secondState.view.metrics.latestCycle = firstUpdate.view?.metrics.latestCycle;
    secondState.view.metrics.previousPrice = firstUpdate.view?.metrics.previousPrice;

    const secondResult = await pollCycleNode(secondState, {});
    const secondUpdate = extractPollCycleUpdate(secondResult);

    expect(secondUpdate.view?.metrics.latestSnapshot?.totalUsd).toBe(0);
  });

  it('executes reduce plans via onchain-actions reduce endpoint when position exists', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([
      {
        chainId: '42161',
        key: '0xpos1',
        contractKey: '0xposition',
        account: '0xwallet',
        marketAddress: '0xmarket',
        sizeInUsd: '2000000000000000000000000000000',
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
    ]);

    const state = buildBaseState();
    state.view.metrics.previousPrice = 46000;
    state.view.metrics.iteration = 10;
    state.view.metrics.cyclesSinceRebalance = 2;
    state.view.metrics.assumedPositionSide = 'long';

    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);

    // When we assume the position is already open and the signal stays bullish,
    // we should not keep planning repeated opens.
    expect(createPerpetualLongMock).not.toHaveBeenCalled();
    expect(createPerpetualReduceMock).not.toHaveBeenCalled();

    const artifactIds = (update.view?.activity.events ?? [])
      .filter((event) => event.type === 'artifact')
      .map((event) => event.artifact.artifactId);
    expect(artifactIds).toContain('gmx-allora-telemetry');
    expect(artifactIds).not.toContain('gmx-allora-execution-plan');
  });

  it('hydrates leverage and notional from an existing onchain position when holding', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([
      {
        chainId: '42161',
        key: '0xpos2',
        contractKey: '0xposition2',
        account: '0xwallet',
        marketAddress: '0xmarket',
        sizeInUsd: '16000000000000000000000000000000',
        sizeInTokens: '0.01',
        collateralAmount: '8000000',
        pendingBorrowingFeesUsd: '0',
        increasedAtTime: '1739325000',
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
    state.view.metrics.previousPrice = 46000;
    state.view.metrics.assumedPositionSide = 'long';

    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);
    const snapshot = update.view?.metrics.latestSnapshot;

    expect(createPerpetualLongMock).not.toHaveBeenCalled();
    expect(snapshot?.totalUsd).toBe(16);
    expect(snapshot?.leverage).toBe(2);
    expect(snapshot?.positionTokens[0]?.valueUsd).toBe(8);
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

    const update = extractPollCycleUpdate(result);
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
        // Different market: still counts towards total exposure, but does not satisfy "already open".
        marketAddress: '0xother',
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

    const update = extractPollCycleUpdate(result);
    const latestCycle = update.view?.metrics.latestCycle;

    expect(latestCycle?.action).toBe('hold');
    expect(latestCycle?.reason).toContain('Exposure limit');
  });
});
