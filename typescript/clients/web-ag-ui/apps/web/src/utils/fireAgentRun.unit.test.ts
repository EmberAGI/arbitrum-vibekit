import { describe, expect, it, vi } from 'vitest';

import { fireAgentRun } from './fireAgentRun';

describe('fireAgentRun', () => {
  it('detaches stale runtime ownership before dispatching fire when no run appears active', async () => {
    const calls: string[] = [];
    const agent = {
      isRunning: false,
      detachActiveRun: vi.fn(async () => calls.push('detachActiveRun')),
      addMessage: vi.fn(() => calls.push('addMessage')),
    };
    const runInFlightRef = { current: false };

    const ok = await fireAgentRun({
      agent,
      runAgent: async () => {
        calls.push('runAgent');
      },
      threadId: 'thread-1',
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(true);
    expect(agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['detachActiveRun', 'addMessage', 'runAgent']);
  });

  it('preempts the active run via stop callback, detaches, then sends the fire command', async () => {
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
      preemptActiveRun: async () => {
        calls.push('stopAgent');
        runInFlightRef.current = false;
      },
      threadId: 'thread-1',
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(true);
    expect(runInFlightRef.current).toBe(true);
    expect(agent.abortRun).not.toHaveBeenCalled();
    expect(agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(agent.addMessage).toHaveBeenCalledTimes(1);
    expect(copilotkit.runAgent).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['stopAgent', 'detachActiveRun', 'addMessage', 'runAgent']);
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

  it('retries on busy errors after detaching active run via AG-UI agent lifecycle', async () => {
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
    const runInFlightRef = { current: false };

    try {
      const ok = await fireAgentRun({
        agent,
        runAgent: async (value) => copilotkit.runAgent({ agent: value }),
        preemptActiveRun: async () => {
          calls.push('stopAgent');
          runInFlightRef.current = false;
        },
        threadId: 'thread-1',
        runInFlightRef,
        createId: () => 'msg-1',
        preemptWaitMs: 0,
      });

      expect(ok).toBe(true);
      expect(agent.abortRun).not.toHaveBeenCalled();
      expect(agent.detachActiveRun).toHaveBeenCalledTimes(1);
      expect(agent.addMessage).toHaveBeenCalledTimes(1);
      expect(calls[0]).toBe('stopAgent');
      expect(calls[1]).toBe('detachActiveRun');
      expect(calls[2]).toBe('addMessage');

      await vi.advanceTimersByTimeAsync(200);

      expect(copilotkit.runAgent).toHaveBeenCalledTimes(2);
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

  it('waits for preemption timeout before dispatching fire when run ownership stays active', async () => {
    vi.useFakeTimers();

    const agent = {
      isRunning: true,
      abortRun: vi.fn(),
      detachActiveRun: vi.fn(async () => undefined),
      addMessage: vi.fn(),
    };
    const copilotkit = {
      runAgent: vi.fn(async () => undefined),
    };
    const runInFlightRef = { current: true };

    try {
      const firePromise = fireAgentRun({
        agent,
        runAgent: async (value) => copilotkit.runAgent({ agent: value }),
        preemptActiveRun: async () => undefined,
        threadId: 'thread-1',
        runInFlightRef,
        createId: () => 'msg-1',
        preemptWaitMs: 40,
        preemptPollMs: 10,
      });

      await vi.advanceTimersByTimeAsync(20);
      expect(agent.addMessage).not.toHaveBeenCalled();
      expect(copilotkit.runAgent).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(40);
      await firePromise;

      expect(agent.addMessage).toHaveBeenCalledTimes(1);
      expect(copilotkit.runAgent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
