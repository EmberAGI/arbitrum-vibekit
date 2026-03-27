import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AlloraInference } from '../src/clients/allora.js';
import type { PerpetualMarket, PerpetualPosition } from '../src/clients/onchainActions.js';
import { ONCHAIN_ACTIONS_API_URL } from '../src/config/constants.js';
import type { ClmmState } from '../src/workflow/context.js';
import { pollCycleNode } from '../src/workflow/nodes/pollCycle.js';

type PollCycleUpdate = {
  thread?: ClmmState['thread'];
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
  ensureCronForThreadMock,
  fetchAlloraInferenceMock,
  listPerpetualMarketsMock,
  listPerpetualPositionsMock,
  listWalletBalancesMock,
  listTokensMock,
  estimatePerpetualQuoteFeeUsdMock,
  createPerpetualLongMock,
  createPerpetualShortMock,
  createPerpetualCloseMock,
  createPerpetualReduceMock,
  createSwapMock,
  getPerpetualLifecycleMock,
  getOnchainClientsMock,
} = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(async () => undefined),
  ensureCronForThreadMock: vi.fn(),
  fetchAlloraInferenceMock: vi.fn<[], Promise<AlloraInference>>(),
  listPerpetualMarketsMock: vi.fn<[], Promise<PerpetualMarket[]>>(),
  listPerpetualPositionsMock: vi.fn<[], Promise<PerpetualPosition[]>>(),
  listWalletBalancesMock: vi.fn<[], Promise<unknown[]>>(),
  listTokensMock: vi.fn<[], Promise<unknown[]>>(),
  estimatePerpetualQuoteFeeUsdMock: vi.fn<[], Promise<number | undefined>>(),
  createPerpetualLongMock: vi.fn<[], Promise<unknown>>(),
  createPerpetualShortMock: vi.fn<[], Promise<unknown>>(),
  createPerpetualCloseMock: vi.fn<[], Promise<unknown>>(),
  createPerpetualReduceMock: vi.fn<[], Promise<unknown>>(),
  createSwapMock: vi.fn<[], Promise<unknown>>(),
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
    listWalletBalances: listWalletBalancesMock,
    listTokens: listTokensMock,
    estimatePerpetualQuoteFeeUsd: estimatePerpetualQuoteFeeUsdMock,
    createPerpetualLong: createPerpetualLongMock,
    createPerpetualShort: createPerpetualShortMock,
    createPerpetualClose: createPerpetualCloseMock,
    createPerpetualReduce: createPerpetualReduceMock,
    createSwap: createSwapMock,
    getPerpetualLifecycle: getPerpetualLifecycleMock,
  }),
  getOnchainClients: getOnchainClientsMock,
}));

vi.mock('../src/workflow/cronScheduler.js', () => ({
  ensureCronForThread: ensureCronForThreadMock,
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
    thread: {
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
    listWalletBalancesMock.mockReset();
    listTokensMock.mockReset();
    estimatePerpetualQuoteFeeUsdMock.mockReset();
    createPerpetualLongMock.mockReset();
    createPerpetualShortMock.mockReset();
    createPerpetualCloseMock.mockReset();
    createPerpetualReduceMock.mockReset();
    createSwapMock.mockReset();
    getPerpetualLifecycleMock.mockReset();
    getOnchainClientsMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    ensureCronForThreadMock.mockReset();
  });

  it('re-arms cron scheduling after restart even when persisted state says cron was scheduled', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValue([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValue([]);
    createPerpetualLongMock.mockResolvedValue({ transactions: [] });

    const state = buildBaseState();
    state.private.cronScheduled = true;
    state.thread.metrics.previousPrice = 46000;

    await pollCycleNode(state, {
      configurable: {
        thread_id: 'thread-1',
      },
    } as never);

    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-1', 5000);
  });

  it('falls back to cached state when Allora fetch fails transiently', async () => {
    fetchAlloraInferenceMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const state = buildBaseState();
    state.thread.metrics.previousPrice = 47000;

    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);

    expect(update.thread?.haltReason).toBeUndefined();
    expect(update.thread?.metrics.staleCycles).toBe(1);
    expect(update.thread?.metrics.previousPrice).toBe(47000);

    const statusMessages = (update.thread?.activity.events ?? [])
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

    expect(update.thread?.haltReason).toContain(
      `ERROR: Failed to fetch GMX markets/positions from ${ONCHAIN_ACTIONS_API_URL}`,
    );
    expect(update.thread?.haltReason).toContain('fetch failed');
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
    listTokensMock.mockResolvedValueOnce([
      {
        tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
        name: 'USD Coin',
        symbol: 'USDC',
        isNative: false,
        decimals: 6,
        isVetted: true,
      },
      {
        tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
        name: 'Ether',
        symbol: 'ETH',
        isNative: true,
        decimals: 18,
        isVetted: true,
      },
    ]);
    listWalletBalancesMock.mockResolvedValueOnce([
      {
        tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
        amount: '5000000000000000',
        symbol: 'ETH',
        valueUsd: 15,
      },
    ]);
    estimatePerpetualQuoteFeeUsdMock.mockResolvedValueOnce(0.12);

    const state = buildBaseState();
    state.thread.metrics.previousPrice = 46000;
    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);

    expect(update.thread?.haltReason).toBe('');
    expect(update.thread?.task?.taskStatus.state).toBe('input-required');
    expect(update.thread?.task?.taskStatus.message?.content).toContain(
      'GMX order simulation failed',
    );
    expect(update.thread?.task?.taskStatus.message?.content).toContain(
      'enough USDC collateral and a small amount of Arbitrum ETH',
    );
    expect(update.thread?.task?.taskStatus.message?.content).toContain(
      'click Continue in Agent Blockers',
    );
    expect(update.thread?.task?.taskStatus.message?.content).not.toContain('{"command":"cycle"}');
    expect(createSwapMock).not.toHaveBeenCalled();
    expect(update.thread?.executionError).toBe('');
    expect(update.thread?.transactionHistory).toHaveLength(0);

    const executionResultArtifact = (update.thread?.activity.events ?? []).find(
      (event) => event.type === 'artifact' && event.artifact.artifactId === 'gmx-allora-execution-result',
    )?.artifact;
    const executionData = executionResultArtifact?.parts.find((part) => part.kind === 'data');
    expect(executionData?.kind).toBe('data');
    expect(executionData?.data).toMatchObject({ ok: false, status: 'blocked' });
    expect((executionData?.data as { error?: string }).error).toBeUndefined();
  });

  it('auto-funds native ETH from USDC and retries cycle when execution fee is insufficient', async () => {
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
      createPerpetualLongMock
        .mockRejectedValueOnce(
          new Error(
            'Onchain actions request failed (500): {"error":"Error: Execute order simulation failed"}',
          ),
        )
        .mockResolvedValueOnce({ transactions: [] });
      estimatePerpetualQuoteFeeUsdMock.mockResolvedValueOnce(0.12);
      listTokensMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          isVetted: true,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          name: 'Ether',
          symbol: 'ETH',
          isNative: true,
          decimals: 18,
          isVetted: true,
        },
      ]);
      listWalletBalancesMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          amount: '30000000',
          symbol: 'USDC',
          valueUsd: 30,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          amount: '0',
          symbol: 'ETH',
          valueUsd: 0,
        },
      ]);
      createSwapMock.mockResolvedValueOnce({
        exactFromAmount: '500000',
        exactToAmount: '1000000000000000',
        transactions: [
          {
            type: 'evm',
            to: '0x1111111111111111111111111111111111111111',
            data: '0xdeadbeef',
            value: '0',
            chainId: '42161',
          },
        ],
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
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createSwapMock).toHaveBeenCalledTimes(1);
      expect(createSwapMock).toHaveBeenCalledWith(
        expect.objectContaining({
          amountType: 'exactIn',
          amount: '1200000',
          slippageTolerance: '0.25',
        }),
      );
      expect(createPerpetualLongMock).toHaveBeenCalledTimes(2);
      expect(update.thread?.task?.taskStatus.state).toBe('working');
      expect(update.thread?.task?.taskStatus.message?.content).not.toContain('trade paused');
      expect(update.thread?.executionError).toBe('');
    } finally {
      if (originalTxExecutionMode) {
        process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
      } else {
        delete process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
      }
    }
  });

  it('treats persistent simulation failures after successful top-up as non-funding execution errors', async () => {
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
      createPerpetualLongMock
        .mockRejectedValueOnce(
          new Error('Onchain actions request failed (500): {"error":"Error: Execute order simulation failed"}'),
        )
        .mockRejectedValueOnce(
          new Error('Onchain actions request failed (500): {"error":"Error: Execute order simulation failed"}'),
        );
      estimatePerpetualQuoteFeeUsdMock.mockResolvedValueOnce(0.12);
      listTokensMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          isVetted: true,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          name: 'Ether',
          symbol: 'ETH',
          isNative: true,
          decimals: 18,
          isVetted: true,
        },
      ]);
      listWalletBalancesMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          amount: '30000000',
          symbol: 'USDC',
          valueUsd: 30,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          amount: '0',
          symbol: 'ETH',
          valueUsd: 0,
        },
      ]);
      createSwapMock.mockResolvedValueOnce({
        exactFromAmount: '1200000',
        exactToAmount: '1000000000000000',
        transactions: [
          {
            type: 'evm',
            to: '0x1111111111111111111111111111111111111111',
            data: '0xdeadbeef',
            value: '0',
            chainId: '42161',
          },
        ],
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
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createSwapMock).toHaveBeenCalledTimes(1);
      expect(createPerpetualLongMock).toHaveBeenCalledTimes(2);
      expect(update.thread?.task?.taskStatus.state).toBe('working');
      expect(update.thread?.task?.taskStatus.message?.content).toContain(
        'upstream planning/simulation issue',
      );
      expect(update.thread?.task?.taskStatus.message?.content).not.toContain(
        'click Continue in Agent Blockers',
      );
      expect(update.thread?.executionError).toContain('Execute order simulation failed');
    } finally {
      if (originalTxExecutionMode) {
        process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
      } else {
        delete process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
      }
    }
  });

  it('attempts top-up when quote fee estimate is unavailable instead of skipping on low-confidence balance heuristic', async () => {
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
      createPerpetualLongMock
        .mockRejectedValueOnce(
          new Error('Onchain actions request failed (500): {"error":"Error: Execute order simulation failed"}'),
        )
        .mockResolvedValueOnce({ transactions: [] });
      estimatePerpetualQuoteFeeUsdMock.mockResolvedValueOnce(undefined);
      listTokensMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          isVetted: true,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          name: 'Ether',
          symbol: 'ETH',
          isNative: true,
          decimals: 18,
          isVetted: true,
        },
      ]);
      listWalletBalancesMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          amount: '30000000',
          symbol: 'USDC',
          valueUsd: 30,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          amount: '800000000000000',
          symbol: 'ETH',
          valueUsd: 2,
        },
      ]);
      createSwapMock.mockResolvedValueOnce({
        exactFromAmount: '1000000',
        exactToAmount: '1000000000000000',
        transactions: [
          {
            type: 'evm',
            to: '0x1111111111111111111111111111111111111111',
            data: '0xdeadbeef',
            value: '0',
            chainId: '42161',
          },
        ],
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
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createSwapMock).toHaveBeenCalledTimes(1);
      expect(createPerpetualLongMock).toHaveBeenCalledTimes(2);
      expect(update.thread?.task?.taskStatus.state).toBe('working');
      expect(update.thread?.executionError).toBe('');
    } finally {
      if (originalTxExecutionMode) {
        process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
      } else {
        delete process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
      }
    }
  });

  it('skips top-up swap when native ETH balance already covers fallback target even if quote estimate is unavailable', async () => {
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
      createPerpetualLongMock.mockRejectedValueOnce(
        new Error('Onchain actions request failed (500): {"error":"Error: Execute order simulation failed"}'),
      );
      estimatePerpetualQuoteFeeUsdMock.mockResolvedValueOnce(undefined);
      listTokensMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          isVetted: true,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          name: 'Ether',
          symbol: 'ETH',
          isNative: true,
          decimals: 18,
          isVetted: true,
        },
      ]);
      listWalletBalancesMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          amount: '30000000',
          symbol: 'USDC',
          valueUsd: 30,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          amount: '4000000000000000',
          symbol: 'ETH',
          valueUsd: 8,
        },
      ]);
      getOnchainClientsMock.mockReturnValue({
        wallet: {
          account: { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          chain: { id: 42161 },
          sendTransaction: vi.fn(),
        },
        public: {
          waitForTransactionReceipt: vi.fn(),
        },
      });

      const state = buildBaseState();
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createSwapMock).not.toHaveBeenCalled();
      expect(createPerpetualLongMock).toHaveBeenCalledTimes(1);
      expect(update.thread?.task?.taskStatus.state).toBe('input-required');
    } finally {
      if (originalTxExecutionMode) {
        process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
      } else {
        delete process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
      }
    }
  });

  it('retries top-up swap with higher slippage tolerance when initial swap fails for slippage', async () => {
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
      createPerpetualLongMock
        .mockRejectedValueOnce(
          new Error('Onchain actions request failed (500): {"error":"Error: Execute order simulation failed"}'),
        )
        .mockResolvedValueOnce({ transactions: [] });
      estimatePerpetualQuoteFeeUsdMock.mockResolvedValueOnce(0.12);
      listTokensMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          isVetted: true,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          name: 'Ether',
          symbol: 'ETH',
          isNative: true,
          decimals: 18,
          isVetted: true,
        },
      ]);
      listWalletBalancesMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          amount: '30000000',
          symbol: 'USDC',
          valueUsd: 30,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          amount: '0',
          symbol: 'ETH',
          valueUsd: 0,
        },
      ]);
      createSwapMock
        .mockRejectedValueOnce(
          new Error(
            'Onchain actions request failed (500): {"error":"Error: Slippage limit exceeded: actual 0.3% > defined limit of 0.25%"}',
          ),
        )
        .mockResolvedValueOnce({
          exactFromAmount: '500000',
          exactToAmount: '1000000000000000',
          transactions: [
            {
              type: 'evm',
              to: '0x1111111111111111111111111111111111111111',
              data: '0xdeadbeef',
              value: '0',
              chainId: '42161',
            },
          ],
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
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createSwapMock).toHaveBeenCalledTimes(2);
      expect(createSwapMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          amountType: 'exactIn',
          slippageTolerance: '0.25',
        }),
      );
      expect(createSwapMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          amountType: 'exactIn',
          slippageTolerance: '0.5',
        }),
      );
      expect(createPerpetualLongMock).toHaveBeenCalledTimes(2);
      expect(update.thread?.task?.taskStatus.state).toBe('working');
      expect(update.thread?.executionError).toBe('');
    } finally {
      if (originalTxExecutionMode) {
        process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
      } else {
        delete process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
      }
    }
  });

  it('re-requests swap plan when top-up first returns approval-only transactions', async () => {
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
      createPerpetualLongMock
        .mockRejectedValueOnce(
          new Error('Onchain actions request failed (500): {"error":"Error: Execute order simulation failed"}'),
        )
        .mockResolvedValueOnce({ transactions: [] });
      estimatePerpetualQuoteFeeUsdMock.mockResolvedValueOnce(0.12);
      listTokensMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          name: 'USD Coin',
          symbol: 'USDC',
          isNative: false,
          decimals: 6,
          isVetted: true,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          name: 'Ether',
          symbol: 'ETH',
          isNative: true,
          decimals: 18,
          isVetted: true,
        },
      ]);
      listWalletBalancesMock.mockResolvedValueOnce([
        {
          tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
          amount: '30000000',
          symbol: 'USDC',
          valueUsd: 30,
        },
        {
          tokenUid: { chainId: '42161', address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
          amount: '0',
          symbol: 'ETH',
          valueUsd: 0,
        },
      ]);
      createSwapMock
        .mockResolvedValueOnce({
          exactFromAmount: '500000',
          exactToAmount: '0',
          transactions: [approvalOnlyTransaction],
        })
        .mockResolvedValueOnce({
          exactFromAmount: '500000',
          exactToAmount: '1000000000000000',
          transactions: [
            {
              type: 'evm',
              to: '0x1111111111111111111111111111111111111111',
              data: '0xdeadbeef',
              value: '0',
              chainId: '42161',
            },
          ],
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
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createSwapMock).toHaveBeenCalledTimes(2);
      expect(createSwapMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          amountType: 'exactIn',
          slippageTolerance: '0.25',
        }),
      );
      expect(createSwapMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          amountType: 'exactIn',
          slippageTolerance: '0.25',
        }),
      );
      expect(createPerpetualLongMock).toHaveBeenCalledTimes(2);
      expect(update.thread?.task?.taskStatus.state).toBe('working');
      expect(update.thread?.executionError).toBe('');
    } finally {
      if (originalTxExecutionMode) {
        process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
      } else {
        delete process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
      }
    }
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
    state.thread.metrics.previousPrice = 46000;
    const result = await pollCycleNode(state, {});

    const update = extractPollCycleUpdate(result);
    const events = update.thread?.activity.events ?? [];
    const artifactIds = events
      .filter((event) => event.type === 'artifact')
      .map((event) => event.artifact.artifactId);

    expect(artifactIds).toContain('gmx-allora-telemetry');
    expect(artifactIds).toContain('gmx-allora-execution-plan');
    expect(update.thread?.metrics.latestSnapshot?.totalUsd).toBeGreaterThan(0);
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
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(getPerpetualLifecycleMock).toHaveBeenCalledWith({
        providerName: 'GMX Perpetuals',
        chainId: '42161',
        txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });
      expect(update.thread?.task?.taskStatus.state).toBe('working');
      expect(update.thread?.task?.taskStatus.message?.content).toContain('execution failed');
      expect(update.thread?.task?.taskStatus.message?.content).toContain('cancelled');
      expect(update.thread?.executionError).toContain('cancelled');
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
  });

  it('decodes cancelled lifecycle reason from reasonBytes when reason text is empty', async () => {
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
        reason: '',
        reasonBytes:
          '0xe09ad0e9000000000000000000000000000000000000000002579e7af429ec8372dc5f83000000000000000000000000000000000000000002400fa64018726c433ae1b0',
        requestedPrice: '696415174373352912272941488',
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
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(update.thread?.task?.taskStatus.message?.content).toContain(
        'OrderNotFulfillableAtAcceptablePrice',
      );
      expect(update.thread?.task?.taskStatus.message?.content).toContain(
        'order price above acceptable bound by ~4.08%',
      );
      expect(update.thread?.executionError).toContain('OrderNotFulfillableAtAcceptablePrice');
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
  });

  it('does not mark submitted open order as confirmed when lifecycle is still pending', async () => {
    const originalTxExecutionMode = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
    try {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = 'execute';

      fetchAlloraInferenceMock.mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      });
      listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
      listPerpetualPositionsMock.mockResolvedValue([]);
      createPerpetualLongMock.mockResolvedValueOnce({
        transactions: [{ type: 'evm', to: '0x1', data: '0x2', value: '0', chainId: '42161' }],
      });
      getPerpetualLifecycleMock.mockResolvedValueOnce({
        providerName: 'GMX Perpetuals',
        chainId: '42161',
        txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        orderKey: '0x2222222222222222222222222222222222222222222222222222222222222222',
        status: 'pending',
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
      state.thread.metrics.previousPrice = 46000;
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(update.thread?.task?.taskStatus.state).toBe('working');
      expect(update.thread?.metrics.pendingPositionSync).toMatchObject({
        expectedSide: 'long',
        sourceAction: 'long',
      });
      expect(update.thread?.metrics.assumedPositionSide).toBeUndefined();
      expect(update.thread?.metrics.lastTradedInferenceSnapshotKey).toBeUndefined();
      expect(update.thread?.transactionHistory).toHaveLength(0);
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
  });

  it('confirms the close before reopening during execute-mode flips', async () => {
    const originalTxExecutionMode = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
    try {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = 'execute';

      fetchAlloraInferenceMock.mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      });
      listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
      listPerpetualPositionsMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            chainId: '42161',
            key: '0xpos-short',
            contractKey: '0xposition-short',
            account: '0xwallet',
            marketAddress: '0xmarket',
            sizeInUsd: '16000000000000000000000000000000',
            sizeInTokens: '0.01',
            collateralAmount: '50',
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
        ]);
      createPerpetualCloseMock.mockResolvedValueOnce({
        transactions: [{ type: 'evm', to: '0xclose', data: '0xclose01', value: '0', chainId: '42161' }],
      });
      createPerpetualShortMock.mockResolvedValueOnce({
        transactions: [{ type: 'evm', to: '0xopen', data: '0xopen01', value: '0', chainId: '42161' }],
      });
      getPerpetualLifecycleMock
        .mockResolvedValueOnce({
          providerName: 'GMX Perpetuals',
          chainId: '42161',
          txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
          orderKey: '0x2222222222222222222222222222222222222222222222222222222222222222',
          status: 'executed',
          precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
          asOf: '2026-01-01T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          providerName: 'GMX Perpetuals',
          chainId: '42161',
          txHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
          orderKey: '0x4444444444444444444444444444444444444444444444444444444444444444',
          status: 'executed',
          precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
          asOf: '2026-01-01T00:00:05.000Z',
        });
      getOnchainClientsMock.mockReturnValue({
        wallet: {
          account: { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          chain: { id: 42161 },
          sendTransaction: vi
            .fn()
            .mockResolvedValueOnce(
              '0x1111111111111111111111111111111111111111111111111111111111111111',
            )
            .mockResolvedValueOnce(
              '0x3333333333333333333333333333333333333333333333333333333333333333',
            ),
        },
        public: {
          waitForTransactionReceipt: vi
            .fn()
            .mockResolvedValueOnce({
              status: 'success',
              transactionHash:
                '0x1111111111111111111111111111111111111111111111111111111111111111',
            })
            .mockResolvedValueOnce({
              status: 'success',
              transactionHash:
                '0x3333333333333333333333333333333333333333333333333333333333333333',
            }),
        },
      });

      const state = buildBaseState();
      state.thread.metrics.previousPrice = 48000;
      state.thread.metrics.assumedPositionSide = 'long';

      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createPerpetualCloseMock).toHaveBeenCalledTimes(1);
      expect(getPerpetualLifecycleMock).toHaveBeenNthCalledWith(1, {
        providerName: 'GMX Perpetuals',
        chainId: '42161',
        txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        walletAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });
      expect(createPerpetualShortMock).toHaveBeenCalledTimes(1);
      expect(createPerpetualCloseMock).toHaveBeenCalledBefore(createPerpetualShortMock);
      expect(update.thread?.metrics.assumedPositionSide).toBe('short');
      expect(update.thread?.metrics.pendingPositionSync).toBeUndefined();
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
  });

  it('retries open trade immediately after pending sync guard resolves as cancelled', async () => {
    const originalTxExecutionMode = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
    try {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = 'execute';

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
      createPerpetualLongMock
        .mockResolvedValueOnce({
          transactions: [{ type: 'evm', to: '0x1', data: '0x2', value: '0', chainId: '42161' }],
        })
        .mockResolvedValueOnce({
          transactions: [{ type: 'evm', to: '0x1', data: '0x2', value: '0', chainId: '42161' }],
        });
      getPerpetualLifecycleMock
        .mockResolvedValueOnce({
          providerName: 'GMX Perpetuals',
          chainId: '42161',
          txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
          orderKey: '0x2222222222222222222222222222222222222222222222222222222222222222',
          status: 'pending',
          precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
          asOf: '2026-01-01T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          providerName: 'GMX Perpetuals',
          chainId: '42161',
          txHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
          orderKey: '0x2222222222222222222222222222222222222222222222222222222222222222',
          status: 'cancelled',
          reason: 'OrderNotFulfillableAtAcceptablePrice',
          precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
          asOf: '2026-01-01T00:00:05.000Z',
        })
        .mockResolvedValueOnce({
          providerName: 'GMX Perpetuals',
          chainId: '42161',
          txHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
          orderKey: '0x4444444444444444444444444444444444444444444444444444444444444444',
          status: 'pending',
          precision: { tokenDecimals: 30, priceDecimals: 30, usdDecimals: 30 },
          asOf: '2026-01-01T00:00:10.000Z',
        });
      getOnchainClientsMock.mockReturnValue({
        wallet: {
          account: { address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          chain: { id: 42161 },
          sendTransaction: vi
            .fn()
            .mockResolvedValueOnce(
              '0x1111111111111111111111111111111111111111111111111111111111111111',
            )
            .mockResolvedValueOnce(
              '0x3333333333333333333333333333333333333333333333333333333333333333',
            ),
        },
        public: {
          waitForTransactionReceipt: vi
            .fn()
            .mockResolvedValue({
              status: 'success',
              transactionHash:
                '0x1111111111111111111111111111111111111111111111111111111111111111',
            })
            .mockResolvedValueOnce({
              status: 'success',
              transactionHash:
                '0x1111111111111111111111111111111111111111111111111111111111111111',
            })
            .mockResolvedValueOnce({
              status: 'success',
              transactionHash:
                '0x3333333333333333333333333333333333333333333333333333333333333333',
            }),
        },
      });

      const firstState = buildBaseState();
      firstState.thread.metrics.previousPrice = 46000;
      const firstResult = await pollCycleNode(firstState, {});
      const firstUpdate = extractPollCycleUpdate(firstResult);
      expect(firstUpdate.thread?.metrics.pendingPositionSync?.sourceTxHash).toBe(
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      );

      const secondState = buildBaseState();
      secondState.thread.metrics = {
        ...secondState.thread.metrics,
        ...(firstUpdate.thread?.metrics ?? {}),
      };
      secondState.thread.metrics.previousPrice = firstUpdate.thread?.metrics?.previousPrice;

      const secondResult = await pollCycleNode(secondState, {});
      const secondUpdate = extractPollCycleUpdate(secondResult);

      expect(createPerpetualLongMock).toHaveBeenCalledTimes(2);
      expect(secondUpdate.thread?.metrics.latestCycle?.action).toBe('open');
      expect(secondUpdate.thread?.metrics.pendingPositionSync?.sourceTxHash).toBe(
        '0x3333333333333333333333333333333333333333333333333333333333333333',
      );
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
    state.thread.metrics.previousPrice = 46000;
    await pollCycleNode(state, {});

    expect(createPerpetualLongMock).toHaveBeenCalledTimes(1);
    expect(createPerpetualShortMock).not.toHaveBeenCalled();
    expect(createPerpetualCloseMock).not.toHaveBeenCalled();
    expect(createPerpetualReduceMock).not.toHaveBeenCalled();
  });

  it('uses delegatee wallet for plan-building when delegation bypass is active', async () => {
    fetchAlloraInferenceMock.mockResolvedValueOnce({
      topicId: 14,
      combinedValue: 47000,
      confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
    });
    listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
    listPerpetualPositionsMock.mockResolvedValueOnce([]);

    const state = buildBaseState();
    state.thread.metrics.previousPrice = 46000;
    if (!state.thread.operatorConfig) {
      throw new Error('Expected operator config in test state');
    }
    state.thread.operatorConfig.delegatorWalletAddress =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    state.thread.operatorConfig.delegateeWalletAddress =
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    state.thread.delegationsBypassActive = true;

    await pollCycleNode(state, {});

    expect(listPerpetualPositionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    );
    expect(createPerpetualLongMock).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    );
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
    state.thread.metrics.previousPrice = 48000;
    await pollCycleNode(state, {});

    expect(createPerpetualShortMock).toHaveBeenCalledTimes(1);
    expect(createPerpetualLongMock).not.toHaveBeenCalled();
    expect(createPerpetualCloseMock).not.toHaveBeenCalled();
    expect(createPerpetualReduceMock).not.toHaveBeenCalled();
  });

  it('closes and reopens within the same cycle when direction flips', async () => {
    const originalTxExecutionMode = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
    try {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = 'plan';

      fetchAlloraInferenceMock.mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 47000,
        confidenceIntervalValues: [46000, 46500, 47000, 47500, 48000],
      });
      listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
      listPerpetualPositionsMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      createPerpetualCloseMock.mockResolvedValueOnce({ transactions: [] });
      createPerpetualShortMock.mockResolvedValueOnce({ transactions: [] });

      const state = buildBaseState();
      state.thread.metrics.previousPrice = 48000;
      state.thread.metrics.assumedPositionSide = 'long';
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createPerpetualShortMock).toHaveBeenCalledTimes(1);
      expect(createPerpetualShortMock).toHaveBeenCalledWith(
        expect.objectContaining({
          marketAddress: '0xmarket',
          leverage: '2',
        }),
      );
      expect(createPerpetualCloseMock).not.toHaveBeenCalled();
      expect(createPerpetualLongMock).not.toHaveBeenCalled();
      expect(createPerpetualReduceMock).not.toHaveBeenCalled();
      expect(update.thread?.metrics.pendingPositionSync).toBeUndefined();
      expect(update.thread?.metrics.assumedPositionSide).toBe('short');
      expect(update.thread?.metrics.latestCycle?.reason).not.toContain(
        'Awaiting GMX position index sync',
      );
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
  });

  it('closes short and reopens long within the same cycle when direction flips bullish', async () => {
    const originalTxExecutionMode = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
    try {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = 'plan';

      fetchAlloraInferenceMock.mockResolvedValueOnce({
        topicId: 14,
        combinedValue: 49000,
        confidenceIntervalValues: [48000, 48500, 49000, 49500, 50000],
      });
      listPerpetualMarketsMock.mockResolvedValueOnce([baseMarket]);
      listPerpetualPositionsMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      createPerpetualCloseMock.mockResolvedValueOnce({ transactions: [] });
      createPerpetualLongMock.mockResolvedValueOnce({ transactions: [] });

      const state = buildBaseState();
      state.thread.metrics.previousPrice = 46000;
      state.thread.metrics.assumedPositionSide = 'short';
      const result = await pollCycleNode(state, {});
      const update = extractPollCycleUpdate(result);

      expect(createPerpetualLongMock).toHaveBeenCalledTimes(1);
      expect(createPerpetualLongMock).toHaveBeenCalledWith(
        expect.objectContaining({
          marketAddress: '0xmarket',
          leverage: '2',
        }),
      );
      expect(createPerpetualCloseMock).not.toHaveBeenCalled();
      expect(createPerpetualShortMock).not.toHaveBeenCalled();
      expect(createPerpetualReduceMock).not.toHaveBeenCalled();
      expect(update.thread?.metrics.pendingPositionSync).toBeUndefined();
      expect(update.thread?.metrics.assumedPositionSide).toBe('long');
      expect(update.thread?.metrics.latestCycle?.reason).not.toContain(
        'Awaiting GMX position index sync',
      );
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
  });

  it('does not defer opposite-side flips behind position-sync guards in plan mode', async () => {
    const originalTxExecutionMode = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
    try {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = 'plan';

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
      listPerpetualPositionsMock.mockResolvedValue([]);
      createPerpetualLongMock.mockResolvedValueOnce({ transactions: [] });
      createPerpetualCloseMock.mockResolvedValueOnce({ transactions: [] });
      createPerpetualShortMock.mockResolvedValueOnce({ transactions: [] });

      const firstState = buildBaseState();
      firstState.thread.metrics.previousPrice = 46000;
      const firstResult = await pollCycleNode(firstState, {});
      const firstUpdate = extractPollCycleUpdate(firstResult);

      const secondState = buildBaseState();
      secondState.thread.metrics = {
        ...secondState.thread.metrics,
        ...(firstUpdate.thread?.metrics ?? {}),
      };
      secondState.thread.metrics.previousPrice = firstUpdate.thread?.metrics?.previousPrice;
      secondState.thread.metrics.latestCycle = firstUpdate.thread?.metrics?.latestCycle;

      const secondResult = await pollCycleNode(secondState, {});
      const secondUpdate = extractPollCycleUpdate(secondResult);

      expect(createPerpetualLongMock).toHaveBeenCalledTimes(1);
      expect(createPerpetualCloseMock).not.toHaveBeenCalled();
      expect(createPerpetualShortMock).toHaveBeenCalledTimes(1);
      expect(secondUpdate.thread?.metrics.latestCycle?.reason).not.toContain(
        'Awaiting GMX position index sync',
      );
      expect(secondUpdate.thread?.metrics.assumedPositionSide).toBe('short');
      expect(secondUpdate.thread?.metrics.pendingPositionSync).toBeUndefined();
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
  });

  it('skips a second trade when inference metrics are unchanged', async () => {
    const originalTxExecutionMode = process.env['GMX_ALLORA_TX_SUBMISSION_MODE'];
    process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = 'plan';

    try {
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
      firstState.thread.metrics.previousPrice = 48000;
      firstState.thread.metrics.assumedPositionSide = 'long';
      const firstResult = await pollCycleNode(firstState, {});

      const firstUpdate = extractPollCycleUpdate(firstResult);

      const secondState = buildBaseState();
      secondState.thread.metrics = {
        ...secondState.thread.metrics,
        ...(firstUpdate.thread?.metrics ?? {}),
      };
      secondState.thread.metrics.assumedPositionSide = firstUpdate.thread?.metrics?.assumedPositionSide;
      secondState.thread.metrics.latestCycle = firstUpdate.thread?.metrics?.latestCycle;
      secondState.thread.metrics.previousPrice = firstUpdate.thread?.metrics?.previousPrice;
      secondState.thread.metrics.cyclesSinceRebalance = 3;

      await pollCycleNode(secondState, {});

      expect(createPerpetualCloseMock).not.toHaveBeenCalled();
      expect(createPerpetualShortMock).toHaveBeenCalledTimes(1);
    } finally {
      process.env['GMX_ALLORA_TX_SUBMISSION_MODE'] = originalTxExecutionMode;
    }
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
    firstState.thread.metrics.previousPrice = 46000;
    const firstResult = await pollCycleNode(firstState, {});

    const firstUpdate = extractPollCycleUpdate(firstResult);

    const secondState = buildBaseState();
    secondState.thread.metrics = {
      ...secondState.thread.metrics,
      ...(firstUpdate.thread?.metrics ?? {}),
    };
    secondState.thread.metrics.assumedPositionSide = firstUpdate.thread?.metrics?.assumedPositionSide;
    secondState.thread.metrics.latestCycle = firstUpdate.thread?.metrics?.latestCycle;
    secondState.thread.metrics.previousPrice = firstUpdate.thread?.metrics?.previousPrice;
    secondState.thread.metrics.cyclesSinceRebalance = 3;

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
    firstState.thread.metrics.previousPrice = 46000;
    const firstResult = await pollCycleNode(firstState, {});

    const firstUpdate = extractPollCycleUpdate(firstResult);

    const secondState = buildBaseState();
    secondState.thread.metrics = {
      ...secondState.thread.metrics,
      ...(firstUpdate.thread?.metrics ?? {}),
    };
    secondState.thread.metrics.latestCycle = firstUpdate.thread?.metrics?.latestCycle;
    secondState.thread.metrics.previousPrice = firstUpdate.thread?.metrics?.previousPrice;

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
    firstState.thread.metrics.previousPrice = 46000;
    const firstResult = await pollCycleNode(firstState, {});
    const firstUpdate = extractPollCycleUpdate(firstResult);
    const firstSnapshot = firstUpdate.thread?.metrics.latestSnapshot;
    expect(firstSnapshot?.totalUsd).toBeGreaterThan(0);

    const secondState = buildBaseState();
    secondState.thread.metrics = {
      ...secondState.thread.metrics,
      ...(firstUpdate.thread?.metrics ?? {}),
    };
    secondState.thread.metrics.assumedPositionSide = firstUpdate.thread?.metrics.assumedPositionSide;
    secondState.thread.metrics.latestCycle = firstUpdate.thread?.metrics.latestCycle;
    secondState.thread.metrics.previousPrice = firstUpdate.thread?.metrics.previousPrice;

    const secondResult = await pollCycleNode(secondState, {});
    const secondUpdate = extractPollCycleUpdate(secondResult);

    expect(secondUpdate.thread?.metrics.latestSnapshot?.totalUsd).toBe(0);
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
    state.thread.metrics.previousPrice = 46000;
    state.thread.metrics.iteration = 10;
    state.thread.metrics.cyclesSinceRebalance = 2;
    state.thread.metrics.assumedPositionSide = 'long';

    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);

    // When we assume the position is already open and the signal stays bullish,
    // we should not keep planning repeated opens.
    expect(createPerpetualLongMock).not.toHaveBeenCalled();
    expect(createPerpetualReduceMock).not.toHaveBeenCalled();

    const artifactIds = (update.thread?.activity.events ?? [])
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
    state.thread.metrics.previousPrice = 46000;
    state.thread.metrics.assumedPositionSide = 'long';

    const result = await pollCycleNode(state, {});
    const update = extractPollCycleUpdate(result);
    const snapshot = update.thread?.metrics.latestSnapshot;

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
    expect(update.thread?.haltReason).toContain('No GMX');
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
    const latestCycle = update.thread?.metrics.latestCycle;

    expect(latestCycle?.action).toBe('hold');
    expect(latestCycle?.reason).toContain('Exposure limit');
  });
});
