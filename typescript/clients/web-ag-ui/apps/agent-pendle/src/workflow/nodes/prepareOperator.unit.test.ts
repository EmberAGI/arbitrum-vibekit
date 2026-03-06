import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { prepareOperatorNode } from './prepareOperator.js';

const { copilotkitEmitStateMock, listTokenizedYieldMarketsMock, listTokensMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
  listTokenizedYieldMarketsMock: vi.fn(),
  listTokensMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../clientFactory.js', () => ({
  getOnchainActionsClient: () => ({
    listTokenizedYieldMarkets: listTokenizedYieldMarketsMock,
    listTokens: listTokensMock,
    listTokenizedYieldPositions: vi.fn(),
    listWalletBalances: vi.fn(),
  }),
  getOnchainClients: vi.fn(),
  getAgentWalletAddress: vi.fn(() => '0x2222222222222222222222222222222222222222'),
}));

describe('prepareOperatorNode', () => {
  it('uses core transition helpers instead of direct Command construction', async () => {
    const source = await readFile(new URL('./prepareOperator.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('returns a no-op update when setup is already complete', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          baseContributionUsd: 25,
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        delegationsBypassActive: false,
        delegationBundle: undefined,
        operatorConfig: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          executionWalletAddress: '0x2222222222222222222222222222222222222222',
          baseContributionUsd: 25,
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          targetYieldToken: {
            marketAddress: '0x3333333333333333333333333333333333333333',
            ptAddress: '0x4444444444444444444444444444444444444444',
            ytAddress: '0x5555555555555555555555555555555555555555',
            ptSymbol: 'PT-USDC',
            ytSymbol: 'YT-USDC',
            underlyingSymbol: 'USDC',
            underlyingAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
            maturity: '2030-01-01T00:00:00.000Z',
            apy: 12,
          },
        },
        setupComplete: true,
        onboardingFlow: { status: 'completed' },
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, {});

    expect(result).toEqual({});
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });

  it('emits a working progress state before market discovery when delegations are already signed', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    listTokenizedYieldMarketsMock.mockReset();
    listTokensMock.mockReset();
    listTokenizedYieldMarketsMock.mockRejectedValue(new Error('market fetch failed'));
    listTokensMock.mockResolvedValue([]);

    const state = {
      thread: {
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: {
              role: 'assistant',
              content: 'Waiting for delegation approval to continue onboarding.',
            },
          },
        },
        onboarding: { step: 3, key: 'delegation-signing' },
        onboardingFlow: { status: 'in_progress' },
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          baseContributionUsd: 25,
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        delegationBundle: {
          chainId: 42161,
          delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
          delegatorAddress: '0x1111111111111111111111111111111111111111',
          delegateeAddress: '0x2222222222222222222222222222222222222222',
          delegations: [],
          intents: [],
          descriptions: [],
          warnings: [],
        },
        delegationsBypassActive: false,
        operatorConfig: undefined,
        selectedPool: undefined,
        setupComplete: false,
        haltReason: undefined,
        executionError: undefined,
        profile: {
          chains: [],
          protocols: [],
          tokens: [],
          pools: [],
          allowedPools: [],
        },
        metrics: {
          cyclesSinceRebalance: 0,
          staleCycles: 0,
          iteration: 0,
        },
        activity: { telemetry: [], events: [] },
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    await prepareOperatorNode(state, {});

    expect(copilotkitEmitStateMock).toHaveBeenCalled();
    const firstEmission = copilotkitEmitStateMock.mock.calls[0]?.[1] as {
      thread?: { task?: { taskStatus?: { state?: string; message?: { content?: string } } } };
    };
    expect(firstEmission.thread?.task?.taskStatus?.state).toBe('working');
    expect(firstEmission.thread?.task?.taskStatus?.message?.content).toContain(
      'Preparing Pendle strategy configuration',
    );
  });
});
