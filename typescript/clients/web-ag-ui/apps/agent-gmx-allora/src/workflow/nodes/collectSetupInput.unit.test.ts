import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { collectSetupInputNode } from './collectSetupInput.js';

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

describe('collectSetupInputNode', () => {
  it('uses core transition helpers instead of direct Command construction', async () => {
    const source = await readFile(new URL('./collectSetupInput.ts', import.meta.url), 'utf8');
    expect(source.includes('new Command(')).toBe(false);
  });

  it('uses shared interrupt payload helpers instead of manual JSON parsing', async () => {
    const source = await readFile(new URL('./collectSetupInput.ts', import.meta.url), 'utf8');
    expect(source.includes('requestInterruptPayload(')).toBe(true);
    expect(source.includes('JSON.parse(')).toBe(false);
  });

  it('persists input-required state before interrupting when runnable config exists', async () => {
    interruptMock.mockReset();
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        task: { id: 'task-1', taskStatus: { state: 'submitted' } },
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await collectSetupInputNode(state, { configurable: { thread_id: 'thread-1' } });

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

    expect(commandResult.goto).toContain('collectSetupInput');
    expect(commandResult.update?.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(commandResult.update?.thread?.onboarding).toEqual({ step: 1, key: 'setup' });
  });
});
