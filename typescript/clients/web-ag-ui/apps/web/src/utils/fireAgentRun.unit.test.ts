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
      abortActiveBackendRun: async () => calls.push('abortActiveBackendRun'),
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
    expect(calls).toEqual([
      'abortRun',
      'detachActiveRun',
      'abortActiveBackendRun',
      'addMessage',
      'runAgent',
    ]);
  });

  it('retries run start when the runtime reports an active run, without re-adding fire message', async () => {
    vi.useFakeTimers();

    const agent = {
      addMessage: vi.fn(),
      abortRun: vi.fn(),
      detachActiveRun: vi.fn(),
    };
    const copilotkit = {
      runAgent: vi
        .fn()
        .mockRejectedValueOnce(new Error('Cannot send RUN_STARTED while a run is still active.'))
        .mockResolvedValueOnce(undefined),
    };
    const runInFlightRef = { current: false };

    try {
      const ok = await fireAgentRun({
        agent,
        runAgent: async (value) => copilotkit.runAgent({ agent: value }),
        abortActiveBackendRun: async () => undefined,
        threadId: 'thread-1',
        runInFlightRef,
        createId: () => 'msg-1',
      });

      expect(ok).toBe(true);
      expect(agent.addMessage).toHaveBeenCalledTimes(1);
      expect(copilotkit.runAgent).toHaveBeenCalledTimes(1);
      expect(runInFlightRef.current).toBe(true);

      await vi.advanceTimersByTimeAsync(200);

      expect(copilotkit.runAgent).toHaveBeenCalledTimes(2);
      expect(agent.addMessage).toHaveBeenCalledTimes(1);
      expect(runInFlightRef.current).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases run-in-flight when run start fails for non-busy reasons', async () => {
    const agent = {
      addMessage: vi.fn(),
      abortRun: vi.fn(),
      detachActiveRun: vi.fn(),
    };
    const copilotkit = {
      runAgent: vi.fn(async () => {
        throw new Error('bad gateway');
      }),
    };
    const runInFlightRef = { current: true };

    const ok = await fireAgentRun({
      agent,
      runAgent: async (value) => copilotkit.runAgent({ agent: value }),
      abortActiveBackendRun: async () => undefined,
      threadId: 'thread-1',
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(true);
    expect(runInFlightRef.current).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(runInFlightRef.current).toBe(false);
    expect(copilotkit.runAgent).toHaveBeenCalledTimes(1);
  });

  it('attempts to abort the active backend run after a busy error (cron/external run protection)', async () => {
    vi.useFakeTimers();

    const calls: string[] = [];

    const agent = {
      isRunning: true,
      abortRun: vi.fn(),
      detachActiveRun: vi.fn(async () => calls.push('detachActiveRun')),
      addMessage: vi.fn(() => calls.push('addMessage')),
    };
    const copilotkit = {
      runAgent: vi
        .fn()
        .mockRejectedValueOnce(
          new Error('Thread is already running a task. Wait for it to finish or choose a different multitask strategy.'),
        )
        .mockResolvedValueOnce(undefined),
    };
    const abortActiveBackendRun = vi.fn(async () => calls.push('abortActiveBackendRun'));
    const runInFlightRef = { current: false };

    try {
      const ok = await fireAgentRun({
        agent,
        runAgent: async (value) => copilotkit.runAgent({ agent: value }),
        abortActiveBackendRun,
        threadId: 'thread-1',
        runInFlightRef,
        createId: () => 'msg-1',
      });

      expect(ok).toBe(true);
      expect(agent.abortRun).not.toHaveBeenCalled();
      expect(agent.detachActiveRun).toHaveBeenCalledTimes(1);
      expect(agent.addMessage).toHaveBeenCalledTimes(1);
      expect(abortActiveBackendRun).toHaveBeenCalledTimes(1);
      expect(calls[0]).toBe('detachActiveRun');
      expect(calls[1]).toBe('abortActiveBackendRun');
      expect(calls[2]).toBe('addMessage');

      await vi.advanceTimersByTimeAsync(200);

      expect(copilotkit.runAgent).toHaveBeenCalledTimes(2);
      expect(abortActiveBackendRun).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing when threadId is missing', async () => {
    const agent = { abortRun: vi.fn(), detachActiveRun: vi.fn(), addMessage: vi.fn() };
    const copilotkit = { runAgent: vi.fn() };
    const runInFlightRef = { current: true };

    const ok = await fireAgentRun({
      agent,
      runAgent: async (value) => copilotkit.runAgent({ agent: value }),
      abortActiveBackendRun: async () => undefined,
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
