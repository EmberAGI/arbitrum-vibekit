import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectDelegationsNode } from './collectDelegations.js';

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

describe('collectDelegationsNode interrupt checkpoint', () => {
  const previousAgentWallet = process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'];

  afterEach(() => {
    if (previousAgentWallet === undefined) {
      delete process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'];
      return;
    }
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = previousAgentWallet;
  });

  it('persists input-required state before interrupting when runnable config exists', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x2222222222222222222222222222222222222222';

    const state = {
      private: { mode: 'debug' },
      view: {
        delegationsBypassActive: false,
        delegationBundle: undefined,
        onboarding: { step: 2, key: 'funding-token' },
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'ETH',
        },
        task: { id: 'task-1', taskStatus: { state: 'submitted' } },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);

    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        view?: {
          task?: { taskStatus?: { state?: string } };
          onboarding?: { step?: number; key?: string };
        };
      };
    };

    expect(commandResult.goto).toContain('collectDelegations');
    expect(commandResult.update?.view?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.view?.onboarding).toEqual({ step: 3, key: 'delegation-signing' });
  });
});
