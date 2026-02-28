import { readFile } from 'node:fs/promises';

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

  it('uses state-driven routing and avoids direct Command construction', async () => {
    const source = await readFile(new URL('./prepareOperator.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('returns state-only update when delegation bundle is missing', async () => {
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x3333333333333333333333333333333333333333';
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
        },
        delegationsBypassActive: false,
        delegationBundle: undefined,
        onboarding: { step: 2, key: 'funding-token' },
        task: { id: 'task-1', taskStatus: { state: 'working' } },
        activity: { telemetry: [], events: [] },
        profile: {},
        metrics: {},
        transactionHistory: [],
      },
    } as unknown as ClmmState;

    const result = await prepareOperatorNode(state, {});

    const updateResult = result as unknown as {
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

    expect(updateResult.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(updateResult.thread?.task?.taskStatus?.message?.content).toBe(
      'Waiting for delegation approval to continue onboarding.',
    );
    expect(updateResult.thread?.onboarding).toEqual({ step: 3, key: 'delegation-signing' });
  });
});
