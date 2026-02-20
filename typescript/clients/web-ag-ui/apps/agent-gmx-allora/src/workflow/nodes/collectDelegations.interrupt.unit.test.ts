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

  it('persists input-required checkpoint and re-enters before interrupt when runnable config exists', async () => {
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
        onboardingFlow: {
          status: 'in_progress',
          revision: 3,
          activeStepId: 'funding-token',
          steps: [
            { id: 'setup', title: 'Strategy Config', status: 'completed' },
            { id: 'funding-token', title: 'Funding Token', status: 'active' },
            { id: 'delegation-signing', title: 'Delegation Signing', status: 'pending' },
          ],
        },
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
    const commandResult = result as {
      goto?: string[];
      update?: {
        view?: {
          task?: { taskStatus?: { state?: string } };
          onboarding?: { step?: number; key?: string };
          onboardingFlow?: { activeStepId?: string };
        };
      };
    };
    expect(commandResult.goto).toContain('collectDelegations');
    expect(commandResult.update?.view?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.view?.onboarding).toEqual({ step: 3, key: 'delegation-signing' });
    expect(commandResult.update?.view?.onboardingFlow?.activeStepId).toBe('delegation-signing');
  });

  it('does not emit another pending checkpoint when delegation step is already persisted', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);
    interruptMock.mockImplementation((request: unknown) => {
      if (!request || typeof request !== 'object' || !('delegationsToSign' in request)) {
        throw new Error('Unexpected interrupt payload');
      }
      const delegationsToSign = (request as { delegationsToSign: Array<Record<string, unknown>> })
        .delegationsToSign;
      const first = delegationsToSign[0];
      if (!first || typeof first !== 'object') {
        throw new Error('No delegation requested');
      }
      return Promise.resolve(
        JSON.stringify({
          outcome: 'signed',
          signedDelegations: [{ ...first, signature: '0x01' }],
        }),
      );
    });
    process.env['GMX_ALLORA_AGENT_WALLET_ADDRESS'] = '0x2222222222222222222222222222222222222222';

    const state = {
      private: { mode: 'debug' },
      view: {
        delegationsBypassActive: false,
        delegationBundle: undefined,
        onboarding: { step: 3, key: 'delegation-signing' },
        onboardingFlow: {
          status: 'in_progress',
          revision: 4,
          activeStepId: 'delegation-signing',
          steps: [
            { id: 'setup', title: 'Strategy Config', status: 'completed' },
            { id: 'funding-token', title: 'Funding Token', status: 'completed' },
            { id: 'delegation-signing', title: 'Delegation Signing', status: 'active' },
          ],
        },
        operatorInput: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          usdcAllocation: 100,
          targetMarket: 'ETH',
        },
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: {
              content: 'Waiting for delegation approval to continue onboarding.',
            },
          },
        },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await collectDelegationsNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(interruptMock).toHaveBeenCalledTimes(1);
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    expect('view' in result).toBe(true);
    const view = (result as {
      view: {
        task?: { taskStatus?: { state?: string } };
        onboarding?: { step?: number; key?: string };
        delegationBundle?: unknown;
      };
    }).view;
    expect(view.task?.taskStatus?.state).toBe('working');
    expect(view.onboarding).toEqual({ step: 3, key: 'delegation-signing' });
    expect(view.delegationBundle).toBeTruthy();
  });

});
