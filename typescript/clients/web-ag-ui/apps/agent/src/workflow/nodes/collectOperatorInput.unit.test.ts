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
  it('returns patch-only interrupt update when runnable config exists', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        task: { id: 'task-1', taskStatus: { state: 'submitted' } },
        activity: { telemetry: [], events: [] },
        poolArtifact: { artifactId: 'mock-pools' },
        profile: {
          agentIncome: 1,
          aum: 2,
          totalUsers: 3,
          apy: 4,
          chains: [],
          protocols: [],
          tokens: [],
          pools: [],
          allowedPools: [],
        },
      },
    } as unknown as ClmmState;

    const result = await collectOperatorInputNode(state, { configurable: { thread_id: 'thread-1' } });
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
    expect(commandResult.goto).toContain('collectOperatorInput');
    expect(commandResult.update?.thread?.onboarding).toEqual({ step: 1, key: 'setup' });
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.thread?.profile).toBeUndefined();
  });
});
