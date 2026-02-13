import { describe, expect, it, vi } from 'vitest';

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
    expect(executePerpetualPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ action: 'close' }),
        txExecutionMode: 'plan',
      }),
    );

    expect('view' in result).toBe(true);
    const view = (result as { view: { command?: unknown; task?: unknown } }).view;
    expect(view.command).toBe('fire');
    expect(view.task).toEqual(
      expect.objectContaining({
        taskStatus: expect.objectContaining({ state: 'completed' }),
      }),
    );
  });
});

