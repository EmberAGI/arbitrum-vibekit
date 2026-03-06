import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { prepareOperatorNode } from './prepareOperator.js';

const { copilotkitEmitStateMock, getCamelotClientMock, loadBootstrapContextMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
  getCamelotClientMock: vi.fn(),
  loadBootstrapContextMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../clientFactory.js', () => ({
  getCamelotClient: getCamelotClientMock,
}));

vi.mock('../store.js', () => ({
  loadBootstrapContext: loadBootstrapContextMock,
}));

describe('prepareOperatorNode', () => {
  afterEach(() => {
    copilotkitEmitStateMock.mockReset();
    getCamelotClientMock.mockReset();
    loadBootstrapContextMock.mockReset();
  });

  it('reroutes to collectDelegations without rewriting onboarding task state when delegation bundle is missing', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    getCamelotClientMock.mockReturnValue({});
    loadBootstrapContextMock.mockResolvedValue({
      agentWalletAddress: '0x3333333333333333333333333333333333333333',
    });

    const state = {
      thread: {
        operatorInput: {
          poolAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          walletAddress: '0x1111111111111111111111111111111111111111',
          baseContributionUsd: 10,
        },
        selectedPool: {
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          token0: { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
          token1: { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
          tickSpacing: 10,
        },
        profile: { allowedPools: [] },
        delegationsBypassActive: false,
        delegationBundle: undefined,
        onboarding: { step: 2, key: 'funding-token' },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        metrics: {},
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, {});

    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        thread?: {
          task?: {
            taskStatus?: {
              state?: string;
              message?: { content?: string };
            };
          };
          onboarding?: { step?: number; key?: string };
        };
      };
    };

    expect(commandResult.goto).toContain('collectDelegations');
    expect(commandResult.update?.thread?.task).toBeUndefined();
    expect(commandResult.update?.thread?.onboarding).toBeUndefined();
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });
});
