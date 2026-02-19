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
  it('defers cycle runs to onboarding when strategy setup is incomplete', async () => {
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
      },
    } as unknown as ClmmState;

    const result = await runCycleCommandNode(state, {});
    const commandResult = result as unknown as { goto?: string[] };

    expect(commandResult.goto).toContain('collectDelegations');
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
  });
});
