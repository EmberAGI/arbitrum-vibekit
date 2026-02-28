import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

import { summarizeNode } from './summarize.js';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

describe('summarizeNode', () => {
  it('preserves input-required task state during onboarding summaries', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: { id: 'msg-1', role: 'assistant', content: 'Waiting for delegation approval.' },
          },
        },
        haltReason: undefined,
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await summarizeNode(state, {});

    expect(result.thread?.task?.taskStatus?.state).toBe('input-required');
    expect(result.thread?.task?.taskStatus?.message?.content).toBe('Waiting for delegation approval.');
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    const emittedView = (copilotkitEmitStateMock.mock.calls[0]?.[1] as { thread?: unknown })?.thread as
      | {
          task?: { taskStatus?: { state?: string; message?: { content?: string } } };
        }
      | undefined;
    expect(emittedView?.task?.taskStatus?.state).toBe('input-required');
    expect(emittedView?.task?.taskStatus?.message?.content).toBe('Waiting for delegation approval.');
  });

  it('clears stale delegation-wait input-required state after onboarding is complete', async () => {
    copilotkitEmitStateMock.mockReset();
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    const state = {
      thread: {
        task: {
          id: 'task-1',
          taskStatus: {
            state: 'input-required',
            message: {
              id: 'msg-1',
              role: 'assistant',
              content: 'Waiting for delegation approval to continue onboarding.',
            },
          },
        },
        setupComplete: true,
        operatorConfig: { walletAddress: '0x8aF45a2C60aBE9172D93aCddB40473DCc66AA9B9' },
        delegationBundle: { delegations: [{ signature: '0xabc' }] },
        haltReason: undefined,
        activity: { telemetry: [], events: [] },
      },
    } as unknown as ClmmState;

    const result = await summarizeNode(state, {});

    expect(result.thread?.task?.taskStatus?.state).toBe('working');
    expect(result.thread?.task?.taskStatus?.message?.content).toBe(
      'Onboarding complete. Pendle strategy is active.',
    );
    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    const emittedView = (copilotkitEmitStateMock.mock.calls[0]?.[1] as { thread?: unknown })?.thread as
      | {
          task?: { taskStatus?: { state?: string; message?: { content?: string } } };
        }
      | undefined;
    expect(emittedView?.task?.taskStatus?.state).toBe('working');
    expect(emittedView?.task?.taskStatus?.message?.content).toBe(
      'Onboarding complete. Pendle strategy is active.',
    );
  });
});
