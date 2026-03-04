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

  it('does not overwrite task state when cycle task is already working', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
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
