import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { pollCycleNode } from './pollCycle.js';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

describe('pollCycleNode', () => {
  it('reroutes to onboarding instead of failing when strategy config is missing', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      view: {
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'ETH',
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        metrics: { iteration: 0, staleCycles: 0, cyclesSinceRebalance: 0 },
        profile: { pools: [], allowedPools: [] },
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await pollCycleNode(state, {});
    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        view?: {
          task?: {
            taskStatus?: {
              state?: string;
              message?: { content?: string };
            };
          };
        };
      };
    };

    expect(commandResult.goto).toContain('collectDelegations');
    expect(commandResult.update?.view?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.view?.task?.taskStatus?.message?.content).toBe(
      'Cycle paused until onboarding input is complete.',
    );
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
  });
});
