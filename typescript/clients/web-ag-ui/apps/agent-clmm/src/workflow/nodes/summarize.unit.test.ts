import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

const copilotkitEmitStateMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

const makeTask = (state: 'working' | 'failed') => ({
  id: 'task-1',
  taskStatus: {
    state,
    message: {
      id: 'msg-1',
      role: 'assistant',
      content: 'status',
    },
    timestamp: '2026-01-01T00:00:00.000Z',
  },
});

const makeState = (overrides: Partial<ClmmState['view']>): ClmmState =>
  ({
    view: {
      task: makeTask('working'),
      activity: { telemetry: [], events: [] },
      accounting: { navSnapshots: [], flowLog: [] },
      profile: { pools: [], allowedPools: [] },
      metrics: { cyclesSinceRebalance: 0, staleCycles: 0, iteration: 0 },
      transactionHistory: [],
      ...overrides,
    },
  }) as ClmmState;

describe('summarizeNode', () => {
  it('keeps the task in a working state after a successful cycle', async () => {
    // Given a cycle with no halt reason
    const { summarizeNode } = await import('./summarize.js');
    const state = makeState({ haltReason: undefined });

    // When summarizing
    const update = await summarizeNode(state, {} as Parameters<typeof summarizeNode>[1]);

    // Then the task remains working
    expect(update.view?.task?.taskStatus.state).toBe('working');
    const statusEvent = update.view?.activity?.events?.find((event) => event.type === 'status');
    expect(statusEvent?.task.taskStatus.state).toBe('working');
  });

  it('marks the task as failed when a halt reason is present', async () => {
    // Given a halt reason during summarization
    const { summarizeNode } = await import('./summarize.js');
    const state = makeState({ haltReason: 'fatal error' });

    // When summarizing
    const update = await summarizeNode(state, {} as Parameters<typeof summarizeNode>[1]);

    // Then the task is failed
    expect(update.view?.task?.taskStatus.state).toBe('failed');
    const statusEvent = update.view?.activity?.events?.find((event) => event.type === 'status');
    expect(statusEvent?.task.taskStatus.state).toBe('failed');
  });
});
