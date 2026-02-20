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
      view: {
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
        view?: {
          task?: { taskStatus?: { state?: string } };
          onboarding?: { step?: number; key?: string };
        };
      };
    };

    expect(commandResult.goto).toContain('collectOperatorInput');
    expect(commandResult.update?.view?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.view?.onboarding).toEqual({ step: 1, key: 'setup' });
  });
});
