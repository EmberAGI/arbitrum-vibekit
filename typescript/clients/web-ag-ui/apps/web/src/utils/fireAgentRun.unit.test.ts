import { describe, expect, it, vi } from 'vitest';

import { fireAgentRun } from './fireAgentRun';

function expectFireDispatch(
  runDirectCommand: ReturnType<typeof vi.fn>,
  callIndex = 0,
  clientMutationId = 'msg-1',
): void {
  expect(runDirectCommand.mock.calls[callIndex]?.[1]).toEqual({
    commandName: 'fire',
    clientMutationId,
  });
}

describe('fireAgentRun', () => {
  it('detaches stale runtime ownership before dispatching fire when no run appears active', async () => {
    const calls: string[] = [];
    const agent = {
      isRunning: false,
      detachActiveRun: vi.fn(async () => calls.push('detachActiveRun')),
    };
    const runDirectCommand = vi.fn(async () => {
      calls.push('runDirectCommand');
    });
    const runInFlightRef = { current: false };

    const ok = await fireAgentRun({
      agent,
      runDirectCommand,
      threadId: 'thread-1',
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(true);
    expect(agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(runDirectCommand).toHaveBeenCalledTimes(1);
    expectFireDispatch(runDirectCommand);
    expect(calls).toEqual(['detachActiveRun', 'runDirectCommand']);
  });

  it('dispatches fire command with a clientMutationId for replay-safe routing', async () => {
    const agent = {
      isRunning: false,
      detachActiveRun: vi.fn(async () => undefined),
    };
    const runDirectCommand = vi.fn(async () => undefined);
    const runInFlightRef = { current: false };

    const ok = await fireAgentRun({
      agent,
      runDirectCommand,
      threadId: 'thread-1',
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(true);
    expectFireDispatch(runDirectCommand);
  });

  it('preempts the active run via stop callback, detaches, then dispatches the fire command', async () => {
    const calls: string[] = [];

    const agent = {
      isRunning: true,
      abortRun: vi.fn(() => calls.push('abortRun')),
      detachActiveRun: vi.fn(async () => calls.push('detachActiveRun')),
    };
    const runDirectCommand = vi.fn(async () => {
      calls.push('runDirectCommand');
    });
    const runInFlightRef = { current: true };

    const ok = await fireAgentRun({
      agent,
      runDirectCommand,
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
    expect(runDirectCommand).toHaveBeenCalledTimes(1);
    expectFireDispatch(runDirectCommand);
    expect(calls).toEqual(['stopAgent', 'detachActiveRun', 'runDirectCommand']);
  });

  it('does not call stop when local run ownership is stale but backend run is not active', async () => {
    const calls: string[] = [];

    const agent = {
      isRunning: false,
      detachActiveRun: vi.fn(async () => calls.push('detachActiveRun')),
    };
    const runDirectCommand = vi.fn(async () => {
      calls.push('runDirectCommand');
    });
    const runInFlightRef = { current: true };
    const preemptActiveRun = vi.fn(async () => {
      calls.push('stopAgent');
    });

    const ok = await fireAgentRun({
      agent,
      runDirectCommand,
      preemptActiveRun,
      threadId: 'thread-1',
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(true);
    expect(preemptActiveRun).not.toHaveBeenCalled();
    expect(agent.detachActiveRun).toHaveBeenCalledTimes(1);
    expect(runDirectCommand).toHaveBeenCalledTimes(1);
    expectFireDispatch(runDirectCommand);
    expect(calls).toEqual(['detachActiveRun', 'runDirectCommand']);
  });

  it('retries run start when the runtime reports an active run, without changing the fire mutation id', async () => {
    vi.useFakeTimers();

    const agent = {
      detachActiveRun: vi.fn(),
    };
    const runDirectCommand = vi
      .fn()
      .mockRejectedValueOnce(new Error('Cannot send RUN_STARTED while a run is still active.'))
      .mockResolvedValueOnce(undefined);
    const runInFlightRef = { current: false };

    try {
      const ok = await fireAgentRun({
        agent,
        runDirectCommand,
        threadId: 'thread-1',
        runInFlightRef,
        createId: () => 'msg-1',
      });

      expect(ok).toBe(true);
      expect(runDirectCommand).toHaveBeenCalledTimes(1);
      expectFireDispatch(runDirectCommand);
      expect(runInFlightRef.current).toBe(true);

      await vi.advanceTimersByTimeAsync(300);

      expect(runDirectCommand).toHaveBeenCalledTimes(2);
      expectFireDispatch(runDirectCommand, 1);
      expect(runInFlightRef.current).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases run-in-flight when fire start fails for non-busy reasons', async () => {
    const agent = {
      detachActiveRun: vi.fn(),
    };
    const runDirectCommand = vi.fn(async () => {
      throw new Error('bad gateway');
    });
    const runInFlightRef = { current: true };

    const ok = await fireAgentRun({
      agent,
      runDirectCommand,
      threadId: 'thread-1',
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(runInFlightRef.current).toBe(false);
    expect(runDirectCommand).toHaveBeenCalledTimes(1);
    expectFireDispatch(runDirectCommand);
  });

  it('retries on busy errors after detaching active run via AG-UI agent lifecycle', async () => {
    vi.useFakeTimers();

    const calls: string[] = [];

    const agent = {
      isRunning: true,
      abortRun: vi.fn(),
      detachActiveRun: vi.fn(async () => calls.push('detachActiveRun')),
    };
    const runDirectCommand = vi
      .fn()
      .mockImplementationOnce(async () => {
        calls.push('runDirectCommand');
        throw new Error(
          'Thread is already running a task. Wait for it to finish or choose a different multitask strategy.',
        );
      })
      .mockImplementationOnce(async () => {
        calls.push('runDirectCommand');
      });
    const runInFlightRef = { current: false };

    try {
      const ok = await fireAgentRun({
        agent,
        runDirectCommand,
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
      expect(runDirectCommand).toHaveBeenCalledTimes(1);
      expectFireDispatch(runDirectCommand);
      expect(calls[0]).toBe('stopAgent');
      expect(calls[1]).toBe('detachActiveRun');
      expect(calls[2]).toBe('runDirectCommand');

      await vi.advanceTimersByTimeAsync(300);

      expect(runDirectCommand).toHaveBeenCalledTimes(2);
      expectFireDispatch(runDirectCommand, 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps retrying busy fire starts long enough to outlast active cycle runs', async () => {
    vi.useFakeTimers();

    const agent = {
      isRunning: false,
      detachActiveRun: vi.fn(async () => undefined),
    };
    const runInFlightRef = { current: false };
    const runDirectCommand = vi
      .fn()
      .mockRejectedValueOnce(new Error('Thread is already running a task.'))
      .mockRejectedValueOnce(new Error('Thread is already running a task.'))
      .mockRejectedValueOnce(new Error('Thread is already running a task.'))
      .mockResolvedValueOnce(undefined);

    try {
      const ok = await fireAgentRun({
        agent,
        runDirectCommand,
        threadId: 'thread-1',
        runInFlightRef,
        createId: () => 'msg-1',
        busyRunMaxRetries: 8,
        busyRunRetryDelayMs: 1000,
      });

      expect(ok).toBe(true);
      expect(runDirectCommand).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);

      expect(runDirectCommand).toHaveBeenCalledTimes(4);
      expectFireDispatch(runDirectCommand, 0);
      expectFireDispatch(runDirectCommand, 1);
      expectFireDispatch(runDirectCommand, 2);
      expectFireDispatch(runDirectCommand, 3);
      expect(runInFlightRef.current).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries aborted fire starts and avoids surfacing transient stream abort errors', async () => {
    vi.useFakeTimers();

    const onError = vi.fn();
    const agent = {
      isRunning: false,
      detachActiveRun: vi.fn(async () => undefined),
    };
    const runInFlightRef = { current: false };
    const runDirectCommand = vi
      .fn()
      .mockRejectedValueOnce(new Error('BodyStreamBuffer was aborted'))
      .mockResolvedValueOnce(undefined);

    try {
      const ok = await fireAgentRun({
        agent,
        runDirectCommand,
        threadId: 'thread-1',
        runInFlightRef,
        createId: () => 'msg-1',
        onError,
        busyRunMaxRetries: 4,
        busyRunRetryDelayMs: 100,
      });

      expect(ok).toBe(true);
      expect(runDirectCommand).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(120);

      expect(runDirectCommand).toHaveBeenCalledTimes(2);
      expectFireDispatch(runDirectCommand, 0);
      expectFireDispatch(runDirectCommand, 1);
      expect(onError).not.toHaveBeenCalled();
      expect(runInFlightRef.current).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing when threadId is missing', async () => {
    const agent = { abortRun: vi.fn(), detachActiveRun: vi.fn() };
    const runDirectCommand = vi.fn();
    const runInFlightRef = { current: true };

    const ok = await fireAgentRun({
      agent,
      runDirectCommand,
      threadId: undefined,
      runInFlightRef,
      createId: () => 'msg-1',
    });

    expect(ok).toBe(false);
    expect(agent.abortRun).not.toHaveBeenCalled();
    expect(agent.detachActiveRun).not.toHaveBeenCalled();
    expect(runDirectCommand).not.toHaveBeenCalled();
  });

  it('waits for preemption timeout before dispatching fire when run ownership stays active', async () => {
    vi.useFakeTimers();

    const agent = {
      isRunning: true,
      abortRun: vi.fn(),
      detachActiveRun: vi.fn(async () => undefined),
    };
    const runDirectCommand = vi.fn(async () => undefined);
    const runInFlightRef = { current: true };

    try {
      const firePromise = fireAgentRun({
        agent,
        runDirectCommand,
        preemptActiveRun: async () => undefined,
        threadId: 'thread-1',
        runInFlightRef,
        createId: () => 'msg-1',
        preemptWaitMs: 40,
        preemptPollMs: 10,
      });

      await vi.advanceTimersByTimeAsync(20);
      expect(runDirectCommand).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(40);
      await firePromise;

      expect(runDirectCommand).toHaveBeenCalledTimes(1);
      expectFireDispatch(runDirectCommand);
    } finally {
      vi.useRealTimers();
    }
  });
});
