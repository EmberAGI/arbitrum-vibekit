import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectFundingTokenInputNode } from './collectFundingTokenInput.js';

const { interruptMock, copilotkitEmitStateMock } = vi.hoisted(() => ({
  interruptMock: vi.fn(),
  copilotkitEmitStateMock: vi.fn(),
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

describe('collectFundingTokenInputNode', () => {
  it('returns patch-only interrupt update when runnable config exists', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        onboarding: { step: 1, key: 'setup' },
        operatorInput: {
          poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
        },
        profile: {
          pools: [
            {
              address: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
              token0: { address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', symbol: 'WETH', decimals: 18 },
              token1: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6 },
            },
          ],
          allowedPools: [],
        },
      },
    } as unknown as ClmmState;

    const result = await collectFundingTokenInputNode(state, { configurable: { thread_id: 'thread-1' } });
    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        thread?: {
          onboarding?: { step?: number; key?: string };
          task?: { taskStatus?: { state?: string } };
          profile?: unknown;
        };
      };
    };

    expect(interruptMock).not.toHaveBeenCalled();
    expect(commandResult.goto).toContain('collectFundingTokenInput');
    expect(commandResult.update?.thread?.onboarding).toEqual({ step: 2, key: 'funding-token' });
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.thread?.profile).toBeUndefined();
  });
});
