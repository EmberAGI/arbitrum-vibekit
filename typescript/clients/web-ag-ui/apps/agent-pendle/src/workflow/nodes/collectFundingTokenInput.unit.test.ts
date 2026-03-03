import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { OnchainActionsClient } from '../../clients/onchainActions.js';
import type { ClmmState } from '../context.js';

import { collectFundingTokenInputNode } from './collectFundingTokenInput.js';

const { interruptMock, copilotkitEmitStateMock, getOnchainActionsClientMock } = vi.hoisted(() => ({
  interruptMock: vi.fn(),
  copilotkitEmitStateMock: vi.fn(),
  getOnchainActionsClientMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../clientFactory.js', () => ({
  getOnchainActionsClient: getOnchainActionsClientMock,
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

const buildState = (): ClmmState =>
  ({
    thread: {
      task: { id: 'task-1', taskStatus: { state: 'submitted' } },
      activity: { telemetry: [], events: [] },
      operatorInput: {
        walletAddress: '0x0000000000000000000000000000000000000001',
        baseContributionUsd: 10,
      },
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
      metrics: { cyclesSinceRebalance: 0, staleCycles: 0, iteration: 0 },
      transactionHistory: [],
    },
  }) as unknown as ClmmState;

describe('collectFundingTokenInputNode', () => {
  it('uses core transition helpers instead of direct Command construction', async () => {
    const source = await readFile(new URL('./collectFundingTokenInput.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('returns patch-only command update for fund-wallet checkpoint when no eligible balances exist', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    getOnchainActionsClientMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    process.env.PENDLE_STABLECOIN_WHITELIST = 'USDai';

    const onchainActionsClient: Pick<
      OnchainActionsClient,
      'listTokenizedYieldPositions' | 'listWalletBalances'
    > = {
      listTokenizedYieldPositions: vi.fn().mockResolvedValue([]),
      listWalletBalances: vi.fn().mockResolvedValue([]),
    };
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);

    const result = await collectFundingTokenInputNode(buildState(), {
      configurable: { thread_id: 'thread-1' },
    });

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        thread?: {
          task?: { taskStatus?: { state?: string } };
          profile?: unknown;
        };
      };
    };
    expect(commandResult.goto).toContain('collectFundingTokenInput');
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.thread?.profile).toBeUndefined();
  });

  it('returns patch-only command update for funding-token checkpoint when options exist', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    getOnchainActionsClientMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    process.env.PENDLE_STABLECOIN_WHITELIST = 'USDai';

    const onchainActionsClient: Pick<
      OnchainActionsClient,
      'listTokenizedYieldPositions' | 'listWalletBalances'
    > = {
      listTokenizedYieldPositions: vi.fn().mockResolvedValue([]),
      listWalletBalances: vi.fn().mockResolvedValue([
        {
          tokenUid: { chainId: '42161', address: '0x00000000000000000000000000000000000000aa' },
          symbol: 'USDai',
          name: 'USDai',
          amount: '100',
          valueUsd: 100,
          decimals: 18,
          isNative: false,
          isVetted: true,
        },
      ]),
    };
    getOnchainActionsClientMock.mockReturnValue(onchainActionsClient);

    const result = await collectFundingTokenInputNode(buildState(), {
      configurable: { thread_id: 'thread-1' },
    });

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        thread?: {
          task?: { taskStatus?: { state?: string } };
          profile?: unknown;
        };
      };
    };
    expect(commandResult.goto).toContain('collectFundingTokenInput');
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.thread?.profile).toBeUndefined();
  });
});
