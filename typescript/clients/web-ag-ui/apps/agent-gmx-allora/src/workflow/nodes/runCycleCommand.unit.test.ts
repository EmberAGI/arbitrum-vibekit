import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { runCycleCommandNode } from './runCycleCommand.js';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

describe('runCycleCommandNode', () => {
  it('uses state-driven routing and avoids direct Command construction', async () => {
    const source = await readFile(new URL('./runCycleCommand.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('defers cycle runs to onboarding via state-only update when setup is incomplete', async () => {
    copilotkitEmitStateMock.mockReset();
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
      },
    } as unknown as ClmmState;

    const result = await runCycleCommandNode(state, {});

    expect(result).toEqual({});
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });

  it('does not overwrite task state when cycle task is already working', async () => {
    copilotkitEmitStateMock.mockReset();
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
        delegationBundle: {
          delegations: [],
        },
        operatorConfig: {
          delegatorWalletAddress: '0x1111111111111111111111111111111111111111',
          delegateeWalletAddress: '0x2222222222222222222222222222222222222222',
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
          baseContributionUsd: 100,
          targetMarket: {
            address: '0x3333333333333333333333333333333333333333',
            indexToken: 'ETH',
            longToken: 'ETH',
            shortToken: 'USDC',
          },
        },
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'working',
          },
        },
      },
    } as unknown as ClmmState;

    const result = await runCycleCommandNode(state, {});

    expect(result).toEqual({
      thread: {
        lifecycle: { phase: 'active' },
      },
    });
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });
});
