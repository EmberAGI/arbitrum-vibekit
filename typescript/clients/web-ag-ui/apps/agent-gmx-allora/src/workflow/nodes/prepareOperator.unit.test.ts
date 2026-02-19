import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { prepareOperatorNode } from './prepareOperator.js';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

describe('prepareOperatorNode', () => {
  const previousAgentWallet = process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'];

  afterEach(() => {
    copilotkitEmitStateMock.mockReset();
    if (previousAgentWallet === undefined) {
      delete process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'];
      return;
    }
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = previousAgentWallet;
  });

  it('reroutes to collectDelegations when delegation bundle is missing', async () => {
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x3333333333333333333333333333333333333333';
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
        delegationsBypassActive: false,
        delegationBundle: undefined,
        onboarding: { step: 2, totalSteps: 3 },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        profile: {},
        metrics: {},
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, {});

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
          onboarding?: { step?: number; totalSteps?: number };
        };
      };
    };

    expect(commandResult.goto).toContain('collectDelegations');
    expect(commandResult.update?.view?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.view?.task?.taskStatus?.message?.content).toBe(
      'Waiting for delegation approval to continue onboarding.',
    );
    expect(commandResult.update?.view?.onboarding).toEqual({ step: 3, totalSteps: 3 });
  });
});
