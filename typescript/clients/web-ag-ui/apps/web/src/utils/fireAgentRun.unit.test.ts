import { describe, expect, it, vi } from 'vitest';

import { fireAgentRun } from './fireAgentRun';

describe('fireAgentRun', () => {
  it('force-detaches the active run then sends the fire command', async () => {
    const calls: string[] = [];

    const agent = {
      abortRun: vi.fn(() => calls.push('abortRun')),
      detachActiveRun: vi.fn(async () => calls.push('detachActiveRun')),
      addMessage: vi.fn(() => calls.push('addMessage')),
    };
    const copilotkit = {
      runAgent: vi.fn(async () => calls.push('runAgent')),
    };

    const runInFlightRef = { current: true };

    const ok = await fireAgentRun({
      agent,
      runAgent: async (value) => copilotkit.runAgent({ agent: value }),
      threadId: 'thread-1',
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(true);
    expect(runInFlightRef.current).toBe(true);
    expect(agent.abortRun).toHaveBeenCalledTimes(1);
    expect(agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(agent.addMessage).toHaveBeenCalledTimes(1);
    expect(copilotkit.runAgent).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['abortRun', 'detachActiveRun', 'addMessage', 'runAgent']);
  });

  it('does nothing when threadId is missing', async () => {
    const agent = { abortRun: vi.fn(), detachActiveRun: vi.fn(), addMessage: vi.fn() };
    const copilotkit = { runAgent: vi.fn() };
    const runInFlightRef = { current: true };

    const ok = await fireAgentRun({
      agent,
      runAgent: async (value) => copilotkit.runAgent({ agent: value }),
      threadId: undefined,
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(false);
    expect(agent.abortRun).not.toHaveBeenCalled();
    expect(agent.detachActiveRun).not.toHaveBeenCalled();
    expect(agent.addMessage).not.toHaveBeenCalled();
    expect(copilotkit.runAgent).not.toHaveBeenCalled();
  });
});
