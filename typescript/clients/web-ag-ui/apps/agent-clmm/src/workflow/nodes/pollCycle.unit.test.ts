import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { pollCycleNode } from './pollCycle.js';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

describe('pollCycleNode', () => {
  afterEach(() => {
    copilotkitEmitStateMock.mockReset();
  });

  it('reroutes to onboarding without mutating onboarding task state when poll prerequisites are missing', async () => {
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    const state = {
      thread: {
        poolArtifact: { id: 'camelot-pools', generatedAt: '2026-01-01T00:00:00Z', kind: 'pool-list', payload: {} },
        operatorInput: {
          poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
        },
        selectedPool: {
          address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          token0: { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
          token1: { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 },
          tickSpacing: 10,
        },
        fundingTokenInput: { fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831' },
        delegationsBypassActive: false,
        delegationBundle: undefined,
        operatorConfig: undefined,
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { events: [], telemetry: [] },
        metrics: {},
        profile: { allowedPools: [] },
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await pollCycleNode(state, {});
    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        thread?: {
          haltReason?: string;
          task?: { taskStatus?: { state?: string; message?: { content?: string } } };
        };
      };
    };

    expect(commandResult.goto).toContain('collectDelegations');
    expect(commandResult.update?.thread?.task).toBeUndefined();
    expect(commandResult.update?.thread?.haltReason).toBeUndefined();
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });
});
