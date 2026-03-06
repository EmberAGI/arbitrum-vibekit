import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectFundingTokenInputNode } from './collectFundingTokenInput.js';

const {
  copilotkitEmitStateMock,
  interruptMock,
  fetchPoolSnapshotMock,
  getCamelotClientMock,
  getOnchainActionsClientMock,
  getOnchainClientsMock,
  estimateTokenAllocationsUsdMock,
} = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
  interruptMock: vi.fn(),
  fetchPoolSnapshotMock: vi.fn(),
  getCamelotClientMock: vi.fn(),
  getOnchainActionsClientMock: vi.fn(),
  getOnchainClientsMock: vi.fn(),
  estimateTokenAllocationsUsdMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('@langchain/langgraph', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@langchain/langgraph');
  return {
    ...actual,
    interrupt: interruptMock,
  };
});

vi.mock('../../clients/emberApi.js', () => ({
  fetchPoolSnapshot: fetchPoolSnapshotMock,
}));

vi.mock('../clientFactory.js', () => ({
  getCamelotClient: getCamelotClientMock,
  getOnchainActionsClient: getOnchainActionsClientMock,
  getOnchainClients: getOnchainClientsMock,
}));

vi.mock('../planning/allocations.js', () => ({
  estimateTokenAllocationsUsd: estimateTokenAllocationsUsdMock,
}));

describe('collectFundingTokenInputNode', () => {
  afterEach(() => {
    copilotkitEmitStateMock.mockReset();
    interruptMock.mockReset();
    fetchPoolSnapshotMock.mockReset();
    getCamelotClientMock.mockReset();
    getOnchainActionsClientMock.mockReset();
    getOnchainClientsMock.mockReset();
    estimateTokenAllocationsUsdMock.mockReset();
  });

  it('auto-selects a funding token from current pool tokens when available', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    interruptMock.mockResolvedValue(
      JSON.stringify({
        fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      }),
    );
    getCamelotClientMock.mockReturnValue({});
    fetchPoolSnapshotMock.mockResolvedValue(undefined);
    estimateTokenAllocationsUsdMock.mockReturnValue({
      token0: 1n,
      token1: 1n,
    });
    getOnchainClientsMock.mockResolvedValue({
      public: {
        readContract: vi.fn().mockResolvedValue(0n),
      },
    });
    getOnchainActionsClientMock.mockReturnValue({
      listWalletBalances: vi.fn().mockResolvedValue([
        {
          tokenUid: {
            chainId: '42161',
            address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          },
          symbol: 'USDC',
          decimals: 6,
          amount: '10000000',
          valueUsd: 10,
        },
        {
          tokenUid: {
            chainId: '42161',
            address: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
          },
          symbol: 'DAI',
          decimals: 18,
          amount: '5000000000000000000',
          valueUsd: 5,
        },
      ]),
    });

    const state = {
      thread: {
        operatorInput: {
          poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
        },
        profile: {
          allowedPools: [
            {
              address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
              tick: -200470,
              tickSpacing: 10,
              token0: {
                symbol: 'USDC',
                address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
                decimals: 6,
                usdPrice: 1,
              },
              token1: {
                symbol: 'WETH',
                address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
                decimals: 18,
                usdPrice: 2000,
              },
            },
          ],
        },
        activity: { telemetry: [], events: [] },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        delegationsBypassActive: false,
        fundingTokenInput: undefined,
      },
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, {});
    const view = (result as { thread: ClmmState['thread'] }).thread;

    expect(view.fundingTokenInput?.fundingTokenAddress).toBe('0xaf88d065e77c8cc2239327c5edb3a432268e5831');
    expect(view.onboarding).toEqual({ step: 3, key: 'delegation-signing' });
    expect(interruptMock).not.toHaveBeenCalled();
  });

  it('does not reintroduce onboarding when funding token is already present after setup completion', async () => {
    const state = {
      thread: {
        operatorInput: {
          poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        onboarding: undefined,
        onboardingFlow: {
          status: 'completed',
          revision: 4,
          steps: [],
        },
        operatorConfig: {
          agentWalletAddress: '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
        },
      },
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, {});
    expect((result as { thread?: ClmmState['thread'] }).thread).toBeUndefined();
  });
});
