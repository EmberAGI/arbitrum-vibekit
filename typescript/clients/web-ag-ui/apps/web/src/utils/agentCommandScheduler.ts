type CommandMessage = {
  id: string;
  role: 'user';
  content: string;
};

type SchedulableAgent = {
  addMessage: (message: CommandMessage) => void;
  isRunning?: boolean | (() => boolean);
};

type TimerHandle = ReturnType<typeof setTimeout>;

export interface AgentCommandScheduler<TAgent extends SchedulableAgent> {
  dispatch(
    command: string,
    options?: { allowSyncCoalesce?: boolean; isReplayAttempt?: boolean },
  ): boolean;
  dispatchCustom(params: {
    command: string;
    run: (agent: TAgent) => Promise<unknown>;
  }): boolean;
  handleRunTerminal(): void;
  reset(): void;
  dispose(): void;
}

export function createAgentCommandScheduler<TAgent extends SchedulableAgent>(params: {
  getAgent: () => TAgent | null;
  getThreadId: () => string | undefined;
  getRunInFlight: () => boolean;
  setRunInFlight: (next: boolean) => void;
  runAgent: (agent: TAgent) => Promise<unknown>;
  createId: () => string;
  isBusyRunError: (error: unknown) => boolean;
  isAgentRunning: (agent: TAgent) => boolean;
  onSyncingChange: (isSyncing: boolean) => void;
  onCommandError?: (command: string, error: unknown) => void;
  onCommandBusy?: (command: string, error: unknown) => void;
  syncReplayDelayMs?: number;
  syncBusyMaxRetries?: number;
  setTimer?: (callback: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}): AgentCommandScheduler<TAgent> {
  const syncReplayDelayMs = params.syncReplayDelayMs ?? 500;
  const syncBusyMaxRetries = params.syncBusyMaxRetries ?? 3;
  const setTimer = params.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = params.clearTimer ?? ((handle: TimerHandle) => clearTimeout(handle));

  let pendingSyncIntent = false;
  let syncRunInFlight = false;
  let syncBusyRetries = 0;
  let replayTimer: TimerHandle | null = null;

  const refreshSyncing = () => {
    params.onSyncingChange(pendingSyncIntent || syncRunInFlight);
  };

  const clearReplayTimer = () => {
    if (replayTimer === null) return;
    clearTimer(replayTimer);
    replayTimer = null;
  };

  const dispatchRun = (paramsForRun: {
    command: string;
    run: (agent: TAgent) => Promise<unknown>;
    options?: { allowSyncCoalesce?: boolean; isReplayAttempt?: boolean };
    beforeRun?: (agent: TAgent) => void;
  }): boolean => {
    const { command, run, options, beforeRun } = paramsForRun;
    const agent = params.getAgent();
    const threadId = params.getThreadId();
    if (!agent || !threadId) {
      return false;
    }

    if (params.getRunInFlight()) {
      if (command === 'sync' && options?.allowSyncCoalesce) {
        pendingSyncIntent = true;
        refreshSyncing();
        return true;
      }
      return false;
    }

    params.setRunInFlight(true);

    if (command === 'sync') {
      syncRunInFlight = true;
      pendingSyncIntent = false;
      if (!options?.isReplayAttempt) {
        syncBusyRetries = 0;
      }
      clearReplayTimer();
      refreshSyncing();
    }

    beforeRun?.(agent);

    void Promise.resolve(run(agent)).catch((error) => {
      params.setRunInFlight(false);

      if (command === 'sync') {
        syncRunInFlight = false;

        const busy = params.isBusyRunError(error) || params.isAgentRunning(agent);
        if (busy && syncBusyRetries < syncBusyMaxRetries) {
          syncBusyRetries += 1;
          pendingSyncIntent = true;
          refreshSyncing();

          if (replayTimer === null) {
            replayTimer = setTimer(() => {
              replayTimer = null;
              replayPendingSync();
            }, syncReplayDelayMs);
          }
          return;
        }

        pendingSyncIntent = false;
        syncBusyRetries = 0;
        refreshSyncing();
      }

      const busy = params.isBusyRunError(error) || params.isAgentRunning(agent);
      if (busy) {
        params.onCommandBusy?.(command, error);
        return;
      }

      params.onCommandError?.(command, error);
    });

    return true;
  };

  const dispatch = (
    command: string,
    options?: { allowSyncCoalesce?: boolean; isReplayAttempt?: boolean },
  ): boolean => {
    return dispatchRun({
      command,
      options,
      beforeRun: (agent) => {
        agent.addMessage({
          id: params.createId(),
          role: 'user',
          content: JSON.stringify({ command }),
        });
      },
      run: params.runAgent,
    });
  };

  const dispatchCustom = (customRunParams: {
    command: string;
    run: (agent: TAgent) => Promise<unknown>;
  }): boolean => {
    return dispatchRun({
      command: customRunParams.command,
      run: customRunParams.run,
    });
  };

  const replayPendingSync = () => {
    if (!pendingSyncIntent) return;
    if (params.getRunInFlight()) return;
    void dispatch('sync', { allowSyncCoalesce: true, isReplayAttempt: true });
  };

  const handleRunTerminal = () => {
    params.setRunInFlight(false);
    syncBusyRetries = 0;
    if (syncRunInFlight) {
      syncRunInFlight = false;
    }
    refreshSyncing();
    replayPendingSync();
  };

  const reset = () => {
    pendingSyncIntent = false;
    syncRunInFlight = false;
    syncBusyRetries = 0;
    clearReplayTimer();
  };

  const dispose = () => {
    clearReplayTimer();
  };

  return {
    dispatch,
    dispatchCustom,
    handleRunTerminal,
    reset,
    dispose,
  };
}
