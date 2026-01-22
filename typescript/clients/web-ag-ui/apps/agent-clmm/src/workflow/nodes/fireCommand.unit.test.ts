import { describe, expect, it, vi } from 'vitest';

import type { ClmmState } from '../context.js';

const copilotkitEmitStateMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const resolveAccountingContextIdMock = vi.hoisted(() => vi.fn().mockReturnValue(undefined));
const cancelCronForThreadMock = vi.hoisted(() => vi.fn());
const loadFlowLogHistoryMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const appendFlowLogHistoryMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const applyAccountingUpdateMock = vi.hoisted(() =>
  vi.fn((input: { existing: ClmmState['view']['accounting'] }) => input.existing),
);
const createFlowEventMock = vi.hoisted(() => vi.fn().mockReturnValue({ id: 'flow-1' }));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

vi.mock('../accounting.js', () => ({
  resolveAccountingContextId: resolveAccountingContextIdMock,
}));

vi.mock('../cronScheduler.js', () => ({
  cancelCronForThread: cancelCronForThreadMock,
}));

vi.mock('../historyStore.js', () => ({
  loadFlowLogHistory: loadFlowLogHistoryMock,
  appendFlowLogHistory: appendFlowLogHistoryMock,
}));

vi.mock('../../accounting/state.js', () => ({
  applyAccountingUpdate: applyAccountingUpdateMock,
  createFlowEvent: createFlowEventMock,
}));

const makeTask = (state: 'working') => ({
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

const makeState = (): ClmmState =>
  ({
    view: {
      task: makeTask('working'),
      accounting: { navSnapshots: [], flowLog: [] },
      profile: { pools: [], allowedPools: [] },
      activity: { telemetry: [], events: [] },
      metrics: { cyclesSinceRebalance: 0, staleCycles: 0, iteration: 0 },
      transactionHistory: [],
    },
  }) as ClmmState;

describe('fireCommandNode', () => {
  it('marks the task as completed when firing the agent', async () => {
    // Given an active task
    const { fireCommandNode } = await import('./fireCommand.js');
    const state = makeState();

    // When firing the agent
    const update = await fireCommandNode(state, {} as Parameters<typeof fireCommandNode>[1]);

    // Then the task enters a completed state
    expect(update.view?.task?.taskStatus.state).toBe('completed');
    expect(update.view?.task?.taskStatus.message?.content).toBe('Agent fired! It will stop trading.');
  });
});
