import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAgentCommandScheduler } from './agentCommandScheduler';

type SchedulerAgent = {
  isRunning?: boolean;
};

describe('agentCommandScheduler', () => {
  let runInFlight = false;
  let threadId: string | undefined = 'thread-1';
  let agent: SchedulerAgent | null;
  let runCommand: ReturnType<typeof vi.fn>;
  let onSyncingChange: ReturnType<typeof vi.fn>;
  let onCommandError: ReturnType<typeof vi.fn>;
  let onCommandBusy: ReturnType<typeof vi.fn>;
  let onSyncRunTerminal: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runInFlight = false;
    threadId = 'thread-1';
    agent = {
      isRunning: false,
    };
    runCommand = vi.fn(async () => undefined);
    onSyncingChange = vi.fn();
    onCommandError = vi.fn();
    onCommandBusy = vi.fn();
    onSyncRunTerminal = vi.fn();
  });

  const createScheduler = (options?: {
    syncReplayDelayMs?: number;
    syncBusyMaxRetries?: number;
  }) => {
    return createAgentCommandScheduler<SchedulerAgent>({
      getAgent: () => agent,
      getThreadId: () => threadId,
      getRunInFlight: () => runInFlight,
      setRunInFlight: (next) => {
        runInFlight = next;
      },
      runCommand,
      createId: () => 'msg-1',
      isBusyRunError: (error) =>
        error instanceof Error && error.message.includes('already active'),
      isAbortLikeError: (error) => error instanceof Error && error.message.includes('aborted'),
      isAgentRunning: (value) => value.isRunning === true,
      onSyncingChange,
      onCommandError,
      onCommandBusy,
      onSyncRunTerminal,
      syncReplayDelayMs: options?.syncReplayDelayMs ?? 25,
      syncBusyMaxRetries: options?.syncBusyMaxRetries ?? 2,
    });
  };

  it('coalesces sync while a run is already in flight', () => {
    runInFlight = true;
    const scheduler = createScheduler();

    const accepted = scheduler.dispatch('sync', { allowSyncCoalesce: true });

    expect(accepted).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(onSyncingChange).toHaveBeenCalledWith(true);

    scheduler.dispose();
  });

  it('replays coalesced sync using the latest command payload', async () => {
    runInFlight = true;
    const scheduler = createScheduler();

    scheduler.dispatch('sync', {
      allowSyncCoalesce: true,
      commandPayload: { clientMutationId: 'm-1' },
    });
    scheduler.dispatch('sync', {
      allowSyncCoalesce: true,
      commandPayload: { clientMutationId: 'm-2' },
    });

    scheduler.handleRunTerminal();
    await Promise.resolve();

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith(agent, {
      command: 'sync',
      commandPayload: {
        clientMutationId: 'm-2',
      },
    });

    scheduler.dispose();
  });

  it('replays pending sync once terminal run state is observed', async () => {
    runInFlight = true;
    const scheduler = createScheduler();

    scheduler.dispatch('sync', { allowSyncCoalesce: true });
    expect(runCommand).not.toHaveBeenCalled();

    scheduler.handleRunTerminal();
    await Promise.resolve();

    expect(runCommand).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('reports only the completed sync mutation id when a newer sync is queued behind it', async () => {
    const scheduler = createScheduler();

    scheduler.dispatch('sync', {
      allowSyncCoalesce: true,
      commandPayload: { clientMutationId: 'm-1' },
    });

    runInFlight = true;
    scheduler.dispatch('sync', {
      allowSyncCoalesce: true,
      commandPayload: { clientMutationId: 'm-2' },
    });

    runInFlight = false;
    scheduler.handleRunTerminal();
    await Promise.resolve();

    expect(onSyncRunTerminal).toHaveBeenCalledTimes(1);
    expect(onSyncRunTerminal).toHaveBeenCalledWith({
      clientMutationId: 'm-1',
    });
    expect(runCommand).toHaveBeenNthCalledWith(2, agent, {
      command: 'sync',
      commandPayload: {
        clientMutationId: 'm-2',
      },
    });

    scheduler.dispose();
  });

  it('uses bounded retries for sync busy responses', async () => {
    vi.useFakeTimers();

    runCommand = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('run already active'))
      .mockRejectedValueOnce(new Error('run already active'));

    const scheduler = createScheduler({ syncReplayDelayMs: 10, syncBusyMaxRetries: 1 });

    try {
      scheduler.dispatch('sync', { allowSyncCoalesce: true });

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(20);

      expect(runCommand).toHaveBeenCalledTimes(2);
      expect(onCommandBusy).toHaveBeenCalledTimes(1);
      expect(onCommandBusy).toHaveBeenCalledWith('sync', expect.any(Error));
      expect(onCommandError).not.toHaveBeenCalled();
      expect(onSyncingChange).toHaveBeenLastCalledWith(false);
    } finally {
      scheduler.dispose();
      vi.useRealTimers();
    }
  });

  it('retries sync on abort-like transport failures before surfacing busy state', async () => {
    vi.useFakeTimers();

    runCommand = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('BodyStreamBuffer was aborted'))
      .mockResolvedValueOnce(undefined);

    const scheduler = createScheduler({ syncReplayDelayMs: 10, syncBusyMaxRetries: 2 });

    try {
      scheduler.dispatch('sync', { allowSyncCoalesce: true });

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(20);

      expect(runCommand).toHaveBeenCalledTimes(2);
      expect(onCommandBusy).not.toHaveBeenCalled();
      expect(onCommandError).not.toHaveBeenCalled();
    } finally {
      scheduler.dispose();
      vi.useRealTimers();
    }
  });

  it('rejects non-sync command dispatch while run is in flight', () => {
    runInFlight = true;
    const scheduler = createScheduler();

    const accepted = scheduler.dispatch('hire');

    expect(accepted).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it('adds a clientMutationId to direct command payloads when one is not provided', () => {
    const scheduler = createScheduler();

    const accepted = scheduler.dispatch('hire');

    expect(accepted).toBe(true);
    expect(runCommand).toHaveBeenCalledWith(agent, {
      command: 'hire',
      commandPayload: {
        clientMutationId: 'msg-1',
      },
    });

    scheduler.dispose();
  });

  it('normalizes busy failures for non-sync commands via onCommandBusy', async () => {
    runCommand = vi.fn(async () => {
      throw new Error('run already active');
    });
    const scheduler = createScheduler();

    scheduler.dispatch('hire');
    await Promise.resolve();

    expect(onCommandBusy).toHaveBeenCalledTimes(1);
    expect(onCommandBusy).toHaveBeenCalledWith('hire', expect.any(Error));
    expect(onCommandError).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it('treats abort-like failures for non-sync commands as transient busy responses', async () => {
    runCommand = vi.fn(async () => {
      throw new Error('BodyStreamBuffer was aborted');
    });
    const scheduler = createScheduler();

    scheduler.dispatch('hire');
    await Promise.resolve();

    expect(onCommandBusy).toHaveBeenCalledTimes(1);
    expect(onCommandBusy).toHaveBeenCalledWith('hire', expect.any(Error));
    expect(onCommandError).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it('dispatches custom runs through the same scheduler gating path', async () => {
    const scheduler = createScheduler();
    const runCustom = vi.fn(async () => undefined);

    const accepted = scheduler.dispatchCustom({
      command: 'resume',
      run: runCustom,
    });
    await Promise.resolve();

    expect(accepted).toBe(true);
    expect(runCustom).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('allows fire custom dispatch to preempt while a run is already in flight', async () => {
    runInFlight = true;
    const scheduler = createScheduler();
    const runFire = vi.fn(async () => undefined);

    const accepted = scheduler.dispatchCustom({
      command: 'fire',
      allowPreemptive: true,
      run: runFire,
    });
    await Promise.resolve();

    expect(accepted).toBe(true);
    expect(runFire).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });
});
