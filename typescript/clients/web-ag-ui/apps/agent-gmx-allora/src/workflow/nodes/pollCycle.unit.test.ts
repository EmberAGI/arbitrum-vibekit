import { readFile } from 'node:fs/promises';

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
  it('uses state-driven routing and avoids direct Command construction', async () => {
    const source = await readFile(new URL('./pollCycle.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('returns state-only onboarding update when strategy config is missing', async () => {
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
    const updateResult = result as unknown as {
      view?: {
        task?: {
          taskStatus?: {
            state?: string;
            message?: { content?: string };
          };
        };
      };
    };

    expect(updateResult.view?.task?.taskStatus?.state).toBe('input-required');
    expect(updateResult.view?.task?.taskStatus?.message?.content).toBe(
      'Cycle paused until onboarding input is complete.',
    );
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
  });
});
