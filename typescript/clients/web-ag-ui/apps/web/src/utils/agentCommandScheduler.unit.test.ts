import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAgentCommandScheduler } from './agentCommandScheduler';

type SchedulerAgent = {
  addMessage: ReturnType<typeof vi.fn>;
  isRunning?: boolean;
};

describe('agentCommandScheduler', () => {
  let runInFlight = false;
  let threadId: string | undefined = 'thread-1';
  let agent: SchedulerAgent | null;
  let runAgent: ReturnType<typeof vi.fn>;
  let onSyncingChange: ReturnType<typeof vi.fn>;
  let onCommandError: ReturnType<typeof vi.fn>;
  let onCommandBusy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runInFlight = false;
    threadId = 'thread-1';
    agent = {
      addMessage: vi.fn(),
      isRunning: false,
    };
    runAgent = vi.fn(async () => undefined);
    onSyncingChange = vi.fn();
    onCommandError = vi.fn();
    onCommandBusy = vi.fn();
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
      runAgent,
      createId: () => 'msg-1',
      isBusyRunError: (error) =>
        error instanceof Error && error.message.includes('already active'),
      isAgentRunning: (value) => value.isRunning === true,
      onSyncingChange,
      onCommandError,
      onCommandBusy,
      syncReplayDelayMs: options?.syncReplayDelayMs ?? 25,
      syncBusyMaxRetries: options?.syncBusyMaxRetries ?? 2,
    });
  };

  it('coalesces sync while a run is already in flight', () => {
    runInFlight = true;
    const scheduler = createScheduler();

    const accepted = scheduler.dispatch('sync', { allowSyncCoalesce: true });

    expect(accepted).toBe(true);
    expect(runAgent).not.toHaveBeenCalled();
    expect(agent?.addMessage).not.toHaveBeenCalled();
    expect(onSyncingChange).toHaveBeenCalledWith(true);

    scheduler.dispose();
  });

  it('replays coalesced sync using the latest message payload', async () => {
    runInFlight = true;
    const scheduler = createScheduler();

    scheduler.dispatch('sync', {
      allowSyncCoalesce: true,
      messagePayload: { clientMutationId: 'm-1' },
    });
    scheduler.dispatch('sync', {
      allowSyncCoalesce: true,
      messagePayload: { clientMutationId: 'm-2' },
    });

    scheduler.handleRunTerminal();
    await Promise.resolve();

    const replayMessage = agent?.addMessage.mock.calls.at(-1)?.[0] as { content?: string } | undefined;
    const parsedContent =
      typeof replayMessage?.content === 'string'
        ? (JSON.parse(replayMessage.content) as { command?: string; clientMutationId?: string })
        : null;

    expect(parsedContent).toEqual({
      command: 'sync',
      clientMutationId: 'm-2',
    });

    scheduler.dispose();
  });

  it('replays pending sync once terminal run state is observed', async () => {
    runInFlight = true;
    const scheduler = createScheduler();

    scheduler.dispatch('sync', { allowSyncCoalesce: true });
    expect(runAgent).not.toHaveBeenCalled();

    scheduler.handleRunTerminal();
    await Promise.resolve();

    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(agent?.addMessage).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('uses bounded retries for sync busy responses', async () => {
    vi.useFakeTimers();

    runAgent = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('run already active'))
      .mockRejectedValueOnce(new Error('run already active'));

    const scheduler = createScheduler({ syncReplayDelayMs: 10, syncBusyMaxRetries: 1 });

    try {
      scheduler.dispatch('sync', { allowSyncCoalesce: true });

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(20);

      expect(runAgent).toHaveBeenCalledTimes(2);
      expect(onCommandBusy).toHaveBeenCalledTimes(1);
      expect(onCommandBusy).toHaveBeenCalledWith('sync', expect.any(Error));
      expect(onCommandError).not.toHaveBeenCalled();
      expect(onSyncingChange).toHaveBeenLastCalledWith(false);
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
    expect(runAgent).not.toHaveBeenCalled();
    expect(agent?.addMessage).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it('normalizes busy failures for non-sync commands via onCommandBusy', async () => {
    runAgent = vi.fn(async () => {
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
    expect(agent?.addMessage).not.toHaveBeenCalled();

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
