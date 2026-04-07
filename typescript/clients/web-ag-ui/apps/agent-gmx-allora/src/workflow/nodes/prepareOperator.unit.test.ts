import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { prepareOperatorNode } from './prepareOperator.js';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));
const { ensureCronForThreadMock } = vi.hoisted(() => ({
  ensureCronForThreadMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));
vi.mock('../cronScheduler.js', () => ({
  ensureCronForThread: ensureCronForThreadMock,
}));

describe('prepareOperatorNode', () => {
  const previousAgentWallet = process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'];

  afterEach(() => {
    copilotkitEmitStateMock.mockReset();
    ensureCronForThreadMock.mockReset();
    if (previousAgentWallet === undefined) {
      delete process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'];
      return;
    }
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = previousAgentWallet;
  });

  it('uses state-driven routing and avoids direct Command construction', async () => {
    const source = await readFile(new URL('./prepareOperator.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('returns state-only update when delegation bundle is missing', async () => {
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x3333333333333333333333333333333333333333';
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'ETH',
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        delegationsBypassActive: false,
        delegationBundle: undefined,
        onboarding: { step: 2, key: 'funding-token' },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        profile: {},
        metrics: {},
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, {});

    const updateResult = result as unknown as {
      thread?: {
        task?: {
          taskStatus?: {
            state?: string;
            message?: { content?: string };
          };
        };
        onboarding?: { step?: number; key?: string };
        profile?: unknown;
      };
    };

    expect(updateResult.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(updateResult.thread?.task?.taskStatus?.message?.content).toBe(
      'Waiting for delegation approval to continue onboarding.',
    );
    expect(updateResult.thread?.onboarding).toEqual({ step: 3, key: 'delegation-signing' });
    expect(updateResult.thread?.profile).toBeUndefined();
  });

  it('keeps delegation-signing onboarding step at 3 while waiting for bundle', async () => {
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x3333333333333333333333333333333333333333';
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'ETH',
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        delegationsBypassActive: false,
        delegationBundle: undefined,
        onboarding: { step: 3, key: 'delegation-signing' },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        profile: {},
        metrics: {},
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, {});

    const updateResult = result as unknown as {
      thread?: {
        onboarding?: { step?: number; key?: string };
      };
    };

    expect(updateResult.thread?.onboarding).toEqual({ step: 3, key: 'delegation-signing' });
  });

  it('returns a no-op update when onboarding is already completed', async () => {
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x3333333333333333333333333333333333333333';
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'ETH',
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        delegationsBypassActive: false,
        delegationBundle: undefined,
        operatorConfig: {
          delegatorWalletAddress: '0x1111111111111111111111111111111111111111',
          delegateeWalletAddress: '0x3333333333333333333333333333333333333333',
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          baseContributionUsd: 100,
          targetMarket: {
            address: '0x4444444444444444444444444444444444444444',
            indexToken: 'ETH',
            longToken: 'ETH',
            shortToken: 'USDC',
          },
        },
        onboardingFlow: { status: 'completed' },
        onboarding: undefined,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, {});

    expect(result).toEqual({});
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });

  it('preserves a distinct collateral token when funding input selected a swap source', async () => {
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x3333333333333333333333333333333333333333';
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    ensureCronForThreadMock.mockReturnValue({ stop: vi.fn() });

    const state = {
      private: {
        pollIntervalMs: 60000,
        cronScheduled: false,
      },
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'BTC',
        },
        fundingTokenInput: {
          fundingTokenAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          fundingTokenDecimals: 18,
          fundingTokenBalanceBaseUnits: '1000000000000000000',
          fundingTokenUsdPrice: 1800,
          collateralTokenDecimals: 6,
        },
        delegationsBypassActive: true,
        delegationBundle: undefined,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        profile: {},
        metrics: {},
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(result).toMatchObject({
      thread: {
        operatorConfig: {
          fundingTokenAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          fundingTokenDecimals: 18,
          fundingTokenBalanceBaseUnits: '1000000000000000000',
          fundingTokenUsdPrice: 1800,
          collateralTokenDecimals: 6,
        },
      },
    });
  });

  it('arms cron scheduling when onboarding completes on an active thread', async () => {
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x3333333333333333333333333333333333333333';
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    ensureCronForThreadMock.mockReturnValue({ stop: vi.fn() });

    const state = {
      private: {
        pollIntervalMs: 60000,
        cronScheduled: false,
      },
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'ETH',
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          collateralTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        delegationsBypassActive: false,
        delegationBundle: {
          chainId: 42161,
          delegationManager: '0x5555555555555555555555555555555555555555',
          delegatorAddress: '0x1111111111111111111111111111111111111111',
          delegateeAddress: '0x3333333333333333333333333333333333333333',
          delegations: [],
          intents: [],
          descriptions: [],
          warnings: [],
        },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        profile: {},
        metrics: {},
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(ensureCronForThreadMock).toHaveBeenCalledWith('thread-1', 60000);
    expect(result).toMatchObject({
      private: {
        cronScheduled: true,
      },
    });
  });
});
