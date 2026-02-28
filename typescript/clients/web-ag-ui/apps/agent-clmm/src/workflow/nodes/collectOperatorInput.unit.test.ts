import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectOperatorInputNode } from './collectOperatorInput.js';

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

describe('collectOperatorInputNode', () => {
  it('persists input-required state before interrupting when runnable config exists', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        task: { id: 'task-1', taskStatus: { state: 'submitted' } },
        activity: { telemetry: [], events: [] },
        poolArtifact: { artifactId: 'camelot-pools', kind: 'table', title: 'Pools', items: [] },
      },
    } as unknown as ClmmState;

    const result = await collectOperatorInputNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);

    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        thread?: {
          task?: { taskStatus?: { state?: string } };
          onboarding?: { step?: number; key?: string };
        };
      };
    };

    expect(commandResult.goto).toContain('collectOperatorInput');
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.thread?.onboarding).toEqual({ step: 1, key: 'setup' });
  });

  it('persists pending checkpoint when onboarding key changes despite unchanged input-required task message', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: {
              content: 'Awaiting operator configuration to continue CLMM setup.',
            },
          },
        },
        onboarding: { step: 2, key: 'funding-token' },
        activity: { telemetry: [], events: [] },
        poolArtifact: { artifactId: 'camelot-pools', kind: 'table', title: 'Pools', items: [] },
      },
    } as unknown as ClmmState;

    const result = await collectOperatorInputNode(state, { configurable: { thread_id: 'thread-1' } });

    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    const commandResult = result as unknown as {
      goto?: string[];
      update?: {
        thread?: {
          onboarding?: { step?: number; key?: string };
          task?: { taskStatus?: { state?: string } };
        };
      };
    };
    expect(commandResult.goto).toContain('collectOperatorInput');
    expect(commandResult.update?.thread?.onboarding).toEqual({ step: 1, key: 'setup' });
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
  });

  it('does not reintroduce onboarding when setup is already complete', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();

    const state = {
      thread: {
        operatorInput: {
          poolAddress: '0xb1026b8e7276e7ac75410f1fcbbe21796e8f7526',
          walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9',
          baseContributionUsd: 10,
        },
        fundingTokenInput: {
          fundingTokenAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
        },
        onboarding: undefined,
        onboardingFlow: {
          status: 'completed',
          revision: 3,
          steps: [],
        },
        operatorConfig: {
          agentWalletAddress: '0x3fd83e40F96C3c81A807575F959e55C34a40e523',
        },
      },
    } as unknown as ClmmState;

    const result = await collectOperatorInputNode(state, {});
    expect(interruptMock).not.toHaveBeenCalled();
    expect(copilotkitEmitStateMock).not.toHaveBeenCalled();
    expect((result as { thread?: ClmmState['thread'] }).thread).toBeUndefined();
  });
});
