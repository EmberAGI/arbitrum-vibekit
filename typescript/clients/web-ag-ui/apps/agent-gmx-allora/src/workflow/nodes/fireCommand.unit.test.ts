import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PerpetualPosition } from '../../clients/onchainActions.js';
import type { ResolvedGmxConfig } from '../../domain/types.js';
import type { ClmmState } from '../context.js';

import { fireCommandNode } from './fireCommand.js';

const {
  cancelCronForThreadMock,
  copilotkitEmitStateMock,
  executePerpetualPlanMock,
  getOnchainActionsClientMock,
  getOnchainClientsMock,
  resolveGmxAlloraTxExecutionModeMock,
} = vi.hoisted(() => ({
  cancelCronForThreadMock: vi.fn(),
  copilotkitEmitStateMock: vi.fn(),
  executePerpetualPlanMock: vi.fn(),
  getOnchainActionsClientMock: vi.fn(),
  getOnchainClientsMock: vi.fn(),
  resolveGmxAlloraTxExecutionModeMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../cronScheduler.js', () => ({
  cancelCronForThread: cancelCronForThreadMock,
}));

vi.mock('../clientFactory.js', () => ({
  getOnchainActionsClient: getOnchainActionsClientMock,
  getOnchainClients: getOnchainClientsMock,
}));

vi.mock('../execution.js', () => ({
  executePerpetualPlan: executePerpetualPlanMock,
}));

vi.mock('../../config/constants.js', async (importOriginal) => {
  const actual: unknown = await importOriginal();
  if (typeof actual !== 'object' || actual === null) {
    throw new Error('Unexpected constants module shape');
  }
  return {
    ...(actual as Record<string, unknown>),
    resolveGmxAlloraTxExecutionMode: resolveGmxAlloraTxExecutionModeMock,
  };
});

function makeResolvedConfig(params: {
  delegatorWalletAddress: `0x${string}`;
  delegateeWalletAddress: `0x${string}`;
  fundingTokenAddress: `0x${string}`;
  marketAddress: `0x${string}`;
}): ResolvedGmxConfig {
  return {
    delegatorWalletAddress: params.delegatorWalletAddress,
    delegateeWalletAddress: params.delegateeWalletAddress,
    baseContributionUsd: 10,
    fundingTokenAddress: params.fundingTokenAddress,
    targetMarket: {
      address: params.marketAddress,
      baseSymbol: 'BTC',
      quoteSymbol: 'USDC',
      token0: { symbol: 'BTC' },
      token1: { symbol: 'USDC' },
      maxLeverage: 2,
    },
    maxLeverage: 2,
  };
}

function makePosition(params: { wallet: `0x${string}`; market: `0x${string}` }): PerpetualPosition {
  return {
    chainId: '42161',
    key: 'pos-key',
    contractKey: 'pos-contract-key',
    account: params.wallet,
    marketAddress: params.market,
    sizeInUsd: '100',
    sizeInTokens: '1',
    collateralAmount: '1',
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
      tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
      name: 'USDC',
      symbol: 'USDC',
      isNative: false,
      decimals: 6,
      iconUri: undefined,
      isVetted: true,
    },
  };
}

describe('fireCommandNode (GMX Allora)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['GMX_FIRE_CLOSE_VERIFY_ATTEMPTS'] = '3';
    process.env['GMX_FIRE_CLOSE_VERIFY_INTERVAL_MS'] = '0';
  });

  afterEach(() => {
    delete process.env['GMX_FIRE_CLOSE_VERIFY_ATTEMPTS'];
    delete process.env['GMX_FIRE_CLOSE_VERIFY_INTERVAL_MS'];
  });

  it("closes the active GMX position (if any) and marks fire as 'completed' when onboarding is complete", async () => {
    const delegatorWalletAddress = '0x0000000000000000000000000000000000000001' as const;
    const delegateeWalletAddress = '0x0000000000000000000000000000000000000002' as const;
    const marketAddress = '0x47c031236e19d024b42f8ae6780e44a573170703' as const;
    const fundingTokenAddress = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const;
    const threadId = 'thread-1';

    const operatorConfig = makeResolvedConfig({
      delegatorWalletAddress,
      delegateeWalletAddress,
      fundingTokenAddress,
      marketAddress,
    });

    const onchainActionsClient = {
      listPerpetualPositions: vi.fn().mockResolvedValue([
        makePosition({ wallet: delegatorWalletAddress, market: marketAddress }),
      ]),
      createPerpetualClose: vi.fn(),
    };

    resolveGmxAlloraTxExecutionModeMock.mockReturnValue('plan');
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);
    getOnchainClientsMock.mockReturnValue(undefined);
    executePerpetualPlanMock.mockResolvedValue({
      action: 'close',
      ok: true,
      transactions: [{ type: 'EVM_TX', to: '0x1', data: '0x2', value: '0', chainId: '42161' }],
      txHashes: [],
      lastTxHash: undefined,
    });
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      view: {
        operatorConfig,
        delegationsBypassActive: true,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        transactionHistory: [],
        profile: { pools: [], allowedPools: [] },
        metrics: { cyclesSinceRebalance: 0, staleCycles: 0, iteration: 0 },
      },
      private: {},
      messages: [],
    } as unknown as ClmmState;

    const result = await fireCommandNode(state, { configurable: { thread_id: threadId } } as never);

    expect(cancelCronForThreadMock).toHaveBeenCalledWith(threadId);
    expect(onchainActionsClient.listPerpetualPositions).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: delegatorWalletAddress }),
    );
    expect(executePerpetualPlanMock).toHaveBeenCalled();
    const firstCall = executePerpetualPlanMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const firstArg = firstCall?.[0] as {
      plan?: { action?: unknown };
      txExecutionMode?: unknown;
    };
    expect(firstArg.plan?.action).toBe('close');
    expect(firstArg.txExecutionMode).toBe('plan');

    expect('view' in result).toBe(true);
    const view = (result as { view: { command?: unknown; task?: unknown } }).view;
    expect(view.command).toBe('fire');
    const task = view.task as { taskStatus?: { state?: unknown } };
    expect(task.taskStatus?.state).toBe('completed');
  });

  it('fails fire when position remains open after bounded verification checks', async () => {
    const delegatorWalletAddress = '0x0000000000000000000000000000000000000011' as const;
    const delegateeWalletAddress = '0x0000000000000000000000000000000000000012' as const;
    const marketAddress = '0x47c031236e19d024b42f8ae6780e44a573170703' as const;
    const fundingTokenAddress = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const;

    const operatorConfig = makeResolvedConfig({
      delegatorWalletAddress,
      delegateeWalletAddress,
      fundingTokenAddress,
      marketAddress,
    });

    const onchainActionsClient = {
      listPerpetualPositions: vi
        .fn()
        .mockResolvedValueOnce([makePosition({ wallet: delegatorWalletAddress, market: marketAddress })])
        .mockResolvedValueOnce([makePosition({ wallet: delegatorWalletAddress, market: marketAddress })])
        .mockResolvedValueOnce([makePosition({ wallet: delegatorWalletAddress, market: marketAddress })])
        .mockResolvedValueOnce([makePosition({ wallet: delegatorWalletAddress, market: marketAddress })]),
      createPerpetualClose: vi.fn(),
    };

    resolveGmxAlloraTxExecutionModeMock.mockReturnValue('execute');
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);
    getOnchainClientsMock.mockReturnValue({});
    executePerpetualPlanMock.mockResolvedValue({
      action: 'close',
      ok: true,
      transactions: [{ type: 'EVM_TX', to: '0x1', data: '0x2', value: '0', chainId: '42161' }],
      txHashes: ['0xabc'],
      lastTxHash: '0xabc',
    });
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      view: {
        operatorConfig,
        delegationBundle: {
          chainId: 42161,
          delegationManager: '0x0000000000000000000000000000000000000021',
          delegatorAddress: delegatorWalletAddress,
          delegateeAddress: delegateeWalletAddress,
          delegations: [],
          intents: [],
          descriptions: [],
          warnings: [],
        },
        delegationsBypassActive: false,
        task: { id: 'task-2', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        transactionHistory: [],
        profile: { pools: [], allowedPools: [] },
        metrics: { cyclesSinceRebalance: 0, staleCycles: 0, iteration: 0 },
      },
      private: {},
      messages: [],
    } as unknown as ClmmState;

    const result = await fireCommandNode(state, {} as never);

    expect(onchainActionsClient.listPerpetualPositions).toHaveBeenCalledTimes(4);
    expect(executePerpetualPlanMock).toHaveBeenCalledTimes(1);

    const task = (result as { view: { task: { taskStatus: { state: string; message?: { content?: string } } } } })
      .view.task;
    expect(task.taskStatus.state).toBe('failed');
    expect(task.taskStatus.message?.content).toContain(
      'position remains open after 3 verification checks.',
    );
  });

  it('reports fire as confirmed closed when no open position remains during verification checks', async () => {
    const delegatorWalletAddress = '0x0000000000000000000000000000000000000031' as const;
    const delegateeWalletAddress = '0x0000000000000000000000000000000000000032' as const;
    const marketAddress = '0x47c031236e19d024b42f8ae6780e44a573170703' as const;
    const fundingTokenAddress = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const;

    const operatorConfig = makeResolvedConfig({
      delegatorWalletAddress,
      delegateeWalletAddress,
      fundingTokenAddress,
      marketAddress,
    });

    const onchainActionsClient = {
      listPerpetualPositions: vi
        .fn()
        .mockResolvedValueOnce([makePosition({ wallet: delegatorWalletAddress, market: marketAddress })])
        .mockResolvedValueOnce([makePosition({ wallet: delegatorWalletAddress, market: marketAddress })])
        .mockResolvedValueOnce([]),
      createPerpetualClose: vi.fn(),
    };

    resolveGmxAlloraTxExecutionModeMock.mockReturnValue('execute');
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);
    getOnchainClientsMock.mockReturnValue({});
    executePerpetualPlanMock.mockResolvedValue({
      action: 'close',
      ok: true,
      transactions: [{ type: 'EVM_TX', to: '0x1', data: '0x2', value: '0', chainId: '42161' }],
      txHashes: ['0xdef'],
      lastTxHash: '0xdef',
    });
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      view: {
        operatorConfig,
        delegationBundle: {
          chainId: 42161,
          delegationManager: '0x0000000000000000000000000000000000000041',
          delegatorAddress: delegatorWalletAddress,
          delegateeAddress: delegateeWalletAddress,
          delegations: [],
          intents: [],
          descriptions: [],
          warnings: [],
        },
        delegationsBypassActive: false,
        task: { id: 'task-3', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        transactionHistory: [],
        profile: { pools: [], allowedPools: [] },
        metrics: { cyclesSinceRebalance: 0, staleCycles: 0, iteration: 0 },
      },
      private: {},
      messages: [],
    } as unknown as ClmmState;

    const result = await fireCommandNode(state, {} as never);

    expect(onchainActionsClient.listPerpetualPositions).toHaveBeenCalledTimes(3);
    const task = (result as { view: { task: { taskStatus: { state: string; message?: { content?: string } } } } })
      .view.task;
    expect(task.taskStatus.state).toBe('completed');
    expect(task.taskStatus.message?.content).toContain('GMX position close confirmed.');
  });

  it('surfaces keeper-side order cancellation reason when close order is cancelled onchain', async () => {
    const delegatorWalletAddress = '0x0000000000000000000000000000000000000051' as const;
    const delegateeWalletAddress = '0x0000000000000000000000000000000000000052' as const;
    const marketAddress = '0x47c031236e19d024b42f8ae6780e44a573170703' as const;
    const fundingTokenAddress = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const;
    const orderKey =
      '0x3644a2310267be22ac9807d50374423e2aff25edba76a4b1ae029ee75195c57a' as const;
    const submissionTxHash =
      '0x7e707996b2a7eb9adba74969832c333c41afc5889b327f5a707df1c18555b3ef' as const;
    const keeperCancelTxHash =
      '0x7b28d8c2f552599675f50dcdad8d74c6c4c44fbdcb582af9b0b266413abc4d4c' as const;
    const delegatorTopic = `0x${delegatorWalletAddress.slice(2).toLowerCase().padStart(64, '0')}` as const;

    const operatorConfig = makeResolvedConfig({
      delegatorWalletAddress,
      delegateeWalletAddress,
      fundingTokenAddress,
      marketAddress,
    });

    const onchainActionsClient = {
      listPerpetualPositions: vi
        .fn()
        .mockResolvedValueOnce([makePosition({ wallet: delegatorWalletAddress, market: marketAddress })])
        .mockResolvedValueOnce([makePosition({ wallet: delegatorWalletAddress, market: marketAddress })]),
      createPerpetualClose: vi.fn(),
    };

    const publicClient = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        blockNumber: 1n,
        logs: [
          {
            address: '0xc8ee91a54287db53897056e12d9819156d3822fb',
            topics: [
              '0x468a25a7ba624ceea6e540ad6f49171b52495b648417ae91bca21676d8a24dc5',
              '0xa7427759bfd3b941f14e687e129519da3c9b0046c5b9aaa290bb1dede63753b3',
              orderKey,
              delegatorTopic,
            ],
            data: '0x',
            transactionHash: submissionTxHash,
          },
        ],
      }),
      getLogs: vi.fn().mockResolvedValue([
        {
          address: '0xc8ee91a54287db53897056e12d9819156d3822fb',
          topics: [
            '0x468a25a7ba624ceea6e540ad6f49171b52495b648417ae91bca21676d8a24dc5',
            '0xc7bb288dfd646d5b6c69d5099dd75b72f9c8c09ec9d40984c8ad8182357ae4b2',
            orderKey,
          ],
          data: '0xe09ad0e90000000000000000000000000000000000000000021270427cb6190b38993bb000000000000000000000000000000000000000000225cc91ce77995cf591b600',
          transactionHash: keeperCancelTxHash,
        },
      ]),
    };

    resolveGmxAlloraTxExecutionModeMock.mockReturnValue('execute');
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);
    getOnchainClientsMock.mockReturnValue({ public: publicClient });
    executePerpetualPlanMock.mockResolvedValue({
      action: 'close',
      ok: true,
      transactions: [{ type: 'EVM_TX', to: '0x1', data: '0x2', value: '0', chainId: '42161' }],
      txHashes: [submissionTxHash],
      lastTxHash: submissionTxHash,
    });
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      view: {
        operatorConfig,
        delegationBundle: {
          chainId: 42161,
          delegationManager: '0x0000000000000000000000000000000000000061',
          delegatorAddress: delegatorWalletAddress,
          delegateeAddress: delegateeWalletAddress,
          delegations: [],
          intents: [],
          descriptions: [],
          warnings: [],
        },
        delegationsBypassActive: false,
        task: { id: 'task-4', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        transactionHistory: [],
        profile: { pools: [], allowedPools: [] },
        metrics: { cyclesSinceRebalance: 0, staleCycles: 0, iteration: 0 },
      },
      private: {},
      messages: [],
    } as unknown as ClmmState;

    const result = await fireCommandNode(state, {} as never);

    const task = (result as { view: { task: { taskStatus: { state: string; message?: { content?: string } } } } })
      .view.task;
    expect(task.taskStatus.state).toBe('failed');
    expect(task.taskStatus.message?.content).toContain('close order was cancelled onchain');
    expect(task.taskStatus.message?.content).toContain('OrderNotFulfillableAtAcceptablePrice');
    expect(publicClient.getTransactionReceipt).toHaveBeenCalledWith({ hash: submissionTxHash });
    expect(publicClient.getLogs).toHaveBeenCalled();
  });
});
