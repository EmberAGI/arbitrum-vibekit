import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectFundingTokenInputNode } from './collectFundingTokenInput.js';

const { copilotkitEmitStateMock, getOnchainActionsClientMock, interruptMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
  getOnchainActionsClientMock: vi.fn(),
  interruptMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('@langchain/langgraph', async (importOriginal) => {
  const actual: unknown = await importOriginal();
  if (typeof actual !== 'object' || actual === null) {
    throw new Error('Unexpected @langchain/langgraph mock import shape');
  }
  return {
    ...(actual as Record<string, unknown>),
    interrupt: interruptMock,
  };
});

vi.mock('../clientFactory.js', () => ({
  getOnchainActionsClient: getOnchainActionsClientMock,
}));

describe('collectFundingTokenInputNode', () => {
  it('uses state-driven routing and avoids direct Command construction', async () => {
    const source = await readFile(new URL('./collectFundingTokenInput.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('returns a state-only update when setup input is missing', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {},
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, {});

    expect(result).toEqual({});
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });

  it('returns a no-op update when funding token is already set after onboarding completion', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getOnchainActionsClientMock.mockReset();

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'BTC',
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        operatorConfig: {
          delegatorWalletAddress: '0x1111111111111111111111111111111111111111',
          delegateeWalletAddress: '0x2222222222222222222222222222222222222222',
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          baseContributionUsd: 100,
          targetMarket: {
            address: '0x3333333333333333333333333333333333333333',
            indexToken: 'BTC',
            longToken: 'BTC',
            shortToken: 'USDC',
          },
        },
        onboarding: undefined,
      },
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, {});

    expect(result).toEqual({});
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });

  it('skips funding-token selection when wallet USDC already covers the requested collateral amount', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getOnchainActionsClientMock.mockReset();
    getOnchainActionsClientMock.mockReturnValue({
      listPerpetualMarkets: vi.fn().mockResolvedValue([
        {
          marketToken: { chainId: '42161', address: '0x4444444444444444444444444444444444444444' },
          longFundingFee: '0',
          shortFundingFee: '0',
          longBorrowingFee: '0',
          shortBorrowingFee: '0',
          chainId: '42161',
          name: 'BTC/USD [WBTC-USDC]',
          indexToken: {
            tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
            name: 'Bitcoin',
            symbol: 'BTC',
            isNative: false,
            decimals: 8,
            iconUri: null,
            isVetted: true,
          },
          longToken: {
            tokenUid: { chainId: '42161', address: '0x2222222222222222222222222222222222222222' },
            name: 'Wrapped BTC',
            symbol: 'WBTC',
            isNative: false,
            decimals: 8,
            iconUri: null,
            isVetted: true,
          },
          shortToken: {
            tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
            name: 'USD Coin',
            symbol: 'USDC',
            isNative: false,
            decimals: 6,
            iconUri: null,
            isVetted: true,
          },
        },
      ]),
      listWalletBalances: vi.fn().mockResolvedValue([
        {
          tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
          amount: '150000000',
          symbol: 'USDC',
          decimals: 6,
          valueUsd: 150,
        },
      ]),
    });

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'BTC',
        },
        onboarding: { step: 2, key: 'funding-token' },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        profile: {},
        metrics: {},
        transactionHistory: [],
        delegationsBypassActive: false,
      },
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, {});

    expect(result).toMatchObject({
      thread: {
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          fundingTokenDecimals: 6,
          fundingTokenBalanceBaseUnits: '150000000',
          fundingTokenUsdPrice: 1,
          collateralTokenDecimals: 6,
        },
        onboarding: { step: 3, key: 'delegation-signing' },
      },
    });
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });

  it('collects a swap-source token when wallet USDC is insufficient and preserves USDC as collateral', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getOnchainActionsClientMock.mockReset();
    interruptMock.mockReset();
    interruptMock.mockResolvedValue({
      fundingTokenAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
    });
    getOnchainActionsClientMock.mockReturnValue({
      listPerpetualMarkets: vi.fn().mockResolvedValue([
        {
          marketToken: { chainId: '42161', address: '0x4444444444444444444444444444444444444444' },
          longFundingFee: '0',
          shortFundingFee: '0',
          longBorrowingFee: '0',
          shortBorrowingFee: '0',
          chainId: '42161',
          name: 'BTC/USD [WBTC-USDC]',
          indexToken: {
            tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
            name: 'Bitcoin',
            symbol: 'BTC',
            isNative: false,
            decimals: 8,
            iconUri: null,
            isVetted: true,
          },
          longToken: {
            tokenUid: { chainId: '42161', address: '0x2222222222222222222222222222222222222222' },
            name: 'Wrapped BTC',
            symbol: 'WBTC',
            isNative: false,
            decimals: 8,
            iconUri: null,
            isVetted: true,
          },
          shortToken: {
            tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
            name: 'USD Coin',
            symbol: 'USDC',
            isNative: false,
            decimals: 6,
            iconUri: null,
            isVetted: true,
          },
        },
      ]),
      listWalletBalances: vi.fn().mockResolvedValue([
        {
          tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
          amount: '25000000',
          symbol: 'USDC',
          decimals: 6,
          valueUsd: 25,
        },
        {
          tokenUid: { chainId: '42161', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' },
          amount: '1000000000000000000',
          symbol: 'WETH',
          decimals: 18,
          valueUsd: 1800,
        },
      ]),
    });

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'BTC',
        },
        onboarding: { step: 2, key: 'funding-token' },
        task: { id: 'task-1', taskStatus: { state: 'submitted' } },
        activity: { telemetry: [], events: [] },
        profile: {},
        metrics: {},
        transactionHistory: [],
        delegationsBypassActive: false,
      },
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, {});

    expect(interruptMock).toHaveBeenCalledTimes(1);
    expect(interruptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gmx-funding-token-request',
        options: [
          expect.objectContaining({
            address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
            symbol: 'WETH',
          }),
        ],
      }),
    );
    expect(result).toMatchObject({
      thread: {
        fundingTokenInput: {
          fundingTokenAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          fundingTokenDecimals: 18,
          fundingTokenBalanceBaseUnits: '1000000000000000000',
          fundingTokenUsdPrice: 1800,
          collateralTokenDecimals: 6,
        },
        onboarding: { step: 3, key: 'delegation-signing' },
      },
    });
  });

  it('persists input-required funding-token state before interrupting when runnable config exists', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getOnchainActionsClientMock.mockReset();
    interruptMock.mockReset();
    getOnchainActionsClientMock.mockReturnValue({
      listPerpetualMarkets: vi.fn().mockResolvedValue([
        {
          marketToken: { chainId: '42161', address: '0x4444444444444444444444444444444444444444' },
          longFundingFee: '0',
          shortFundingFee: '0',
          longBorrowingFee: '0',
          shortBorrowingFee: '0',
          chainId: '42161',
          name: 'BTC/USD [WBTC-USDC]',
          indexToken: {
            tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
            name: 'Bitcoin',
            symbol: 'BTC',
            isNative: false,
            decimals: 8,
            iconUri: null,
            isVetted: true,
          },
          longToken: {
            tokenUid: { chainId: '42161', address: '0x2222222222222222222222222222222222222222' },
            name: 'Wrapped BTC',
            symbol: 'WBTC',
            isNative: false,
            decimals: 8,
            iconUri: null,
            isVetted: true,
          },
          shortToken: {
            tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
            name: 'USD Coin',
            symbol: 'USDC',
            isNative: false,
            decimals: 6,
            iconUri: null,
            isVetted: true,
          },
        },
      ]),
      listWalletBalances: vi.fn().mockResolvedValue([
        {
          tokenUid: { chainId: '42161', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' },
          amount: '1000000000000000000',
          symbol: 'WETH',
          decimals: 18,
          valueUsd: 1800,
        },
      ]),
    });

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'BTC',
        },
        onboarding: { step: 2, key: 'funding-token' },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
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
        metrics: {},
        transactionHistory: [],
        delegationsBypassActive: false,
      },
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);

    const commandResult = result as {
      goto?: string[];
      update?: {
        thread?: {
          task?: { taskStatus?: { state?: string; message?: { content?: string } } };
          onboarding?: { step?: number; key?: string };
          profile?: unknown;
        };
      };
    };

    expect(commandResult.goto).toContain('collectFundingTokenInput');
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.thread?.task?.taskStatus?.message?.content).toContain(
      'Select a wallet token to swap into USDC collateral',
    );
    expect(commandResult.update?.thread?.onboarding).toEqual({ step: 2, key: 'funding-token' });
    expect(commandResult.update?.thread?.profile).toBeUndefined();
  });

  it('does not emit another pending funding-token checkpoint when the step is already persisted', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getOnchainActionsClientMock.mockReset();
    interruptMock.mockReset();
    interruptMock.mockResolvedValue(
      JSON.stringify({
        fundingTokenAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      }),
    );
    getOnchainActionsClientMock.mockReturnValue({
      listPerpetualMarkets: vi.fn().mockResolvedValue([
        {
          marketToken: { chainId: '42161', address: '0x4444444444444444444444444444444444444444' },
          longFundingFee: '0',
          shortFundingFee: '0',
          longBorrowingFee: '0',
          shortBorrowingFee: '0',
          chainId: '42161',
          name: 'BTC/USD [WBTC-USDC]',
          indexToken: {
            tokenUid: { chainId: '42161', address: '0x1111111111111111111111111111111111111111' },
            name: 'Bitcoin',
            symbol: 'BTC',
            isNative: false,
            decimals: 8,
            iconUri: null,
            isVetted: true,
          },
          longToken: {
            tokenUid: { chainId: '42161', address: '0x2222222222222222222222222222222222222222' },
            name: 'Wrapped BTC',
            symbol: 'WBTC',
            isNative: false,
            decimals: 8,
            iconUri: null,
            isVetted: true,
          },
          shortToken: {
            tokenUid: { chainId: '42161', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
            name: 'USD Coin',
            symbol: 'USDC',
            isNative: false,
            decimals: 6,
            iconUri: null,
            isVetted: true,
          },
        },
      ]),
      listWalletBalances: vi.fn().mockResolvedValue([
        {
          tokenUid: { chainId: '42161', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1' },
          amount: '1000000000000000000',
          symbol: 'WETH',
          decimals: 18,
          valueUsd: 1800,
        },
      ]),
    });

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'BTC',
        },
        onboarding: { step: 2, key: 'funding-token' },
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: {
              content:
                'Select a wallet token to swap into USDC collateral before opening the GMX position.',
            },
          },
        },
        activity: { telemetry: [], events: [] },
        metrics: {},
        transactionHistory: [],
        delegationsBypassActive: false,
      },
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(interruptMock).toHaveBeenCalledTimes(1);
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      thread: {
        fundingTokenInput: {
          fundingTokenAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        onboarding: { step: 3, key: 'delegation-signing' },
      },
    });
  });
});
