type SchedulableAgent = {
  isRunning?: boolean | (() => boolean);
};

type CommandPayload = Record<string, unknown>;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface AgentCommandScheduler<TAgent extends SchedulableAgent> {
  dispatch(
    command: string,
    options?: {
      allowSyncCoalesce?: boolean;
      isReplayAttempt?: boolean;
      commandPayload?: CommandPayload;
    },
  ): boolean;
  dispatchCustom(params: {
    command: string;
    allowPreemptive?: boolean;
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
  runCommand: (
    agent: TAgent,
    params: {
      command: string;
      commandPayload?: CommandPayload;
    },
  ) => Promise<unknown>;
  createId: () => string;
  isBusyRunError: (error: unknown) => boolean;
  isAbortLikeError?: (error: unknown) => boolean;
  isAgentRunning: (agent: TAgent) => boolean;
  onSyncingChange: (isSyncing: boolean) => void;
  onSyncRunTerminal?: (commandPayload?: CommandPayload) => void;
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
  let pendingSyncCommandPayload: CommandPayload | undefined;
  let syncRunInFlight = false;
  let activeSyncCommandPayload: CommandPayload | undefined;
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
    options?: {
      allowSyncCoalesce?: boolean;
      isReplayAttempt?: boolean;
      commandPayload?: CommandPayload;
      allowPreemptive?: boolean;
    };
    beforeRun?: (agent: TAgent) => void;
  }): boolean => {
    const { command, run, options, beforeRun } = paramsForRun;
    const agent = params.getAgent();
    const threadId = params.getThreadId();
    if (!agent || !threadId) {
      return false;
    }

    if (params.getRunInFlight()) {
      if (command === 'refresh' && options?.allowSyncCoalesce) {
        pendingSyncIntent = true;
        pendingSyncCommandPayload = options.commandPayload;
        refreshSyncing();
        return true;
      }
      if (options?.allowPreemptive) {
        // `fire` is preemptive by policy and may run while local in-flight ownership is set.
      } else {
        return false;
      }
    }

    params.setRunInFlight(true);

    if (command === 'refresh') {
      syncRunInFlight = true;
      activeSyncCommandPayload = options?.commandPayload;
      pendingSyncIntent = false;
      pendingSyncCommandPayload = options?.commandPayload;
      if (!options?.isReplayAttempt) {
        syncBusyRetries = 0;
      }
      clearReplayTimer();
      refreshSyncing();
    }

    beforeRun?.(agent);

    void Promise.resolve(run(agent)).catch((error) => {
      params.setRunInFlight(false);

      if (command === 'refresh') {
        syncRunInFlight = false;
        activeSyncCommandPayload = undefined;

        const busy = params.isBusyRunError(error) || params.isAgentRunning(agent);
        const aborted = params.isAbortLikeError?.(error) ?? false;
        if ((busy || aborted) && syncBusyRetries < syncBusyMaxRetries) {
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
      const aborted = params.isAbortLikeError?.(error) ?? false;
      if (busy || aborted) {
        params.onCommandBusy?.(command, error);
        return;
      }

      params.onCommandError?.(command, error);
    });

    return true;
  };

  const dispatch = (
    command: string,
    options?: {
      allowSyncCoalesce?: boolean;
      isReplayAttempt?: boolean;
      commandPayload?: CommandPayload;
    },
  ): boolean => {
    const payload = options?.commandPayload ?? {};
    const hasClientMutationId =
      typeof payload['clientMutationId'] === 'string' &&
      (payload['clientMutationId'] as string).length > 0;
    const commandPayload = hasClientMutationId
      ? payload
      : {
          ...payload,
          clientMutationId: params.createId(),
        };

    return dispatchRun({
      command,
      options,
      run: (agent) =>
        params.runCommand(agent, {
          command,
          commandPayload,
        }),
    });
  };

  const dispatchCustom = (customRunParams: {
    command: string;
    allowPreemptive?: boolean;
    run: (agent: TAgent) => Promise<unknown>;
  }): boolean => {
    return dispatchRun({
      command: customRunParams.command,
      options: {
        allowPreemptive: customRunParams.allowPreemptive,
      },
      run: customRunParams.run,
    });
  };

  const replayPendingSync = () => {
    if (!pendingSyncIntent) return;
    if (params.getRunInFlight()) return;
    void dispatch('refresh', {
      allowSyncCoalesce: true,
      isReplayAttempt: true,
      commandPayload: pendingSyncCommandPayload,
    });
  };

  const handleRunTerminal = () => {
    params.setRunInFlight(false);
    syncBusyRetries = 0;
    if (syncRunInFlight) {
      const completedSyncCommandPayload = activeSyncCommandPayload;
      syncRunInFlight = false;
      activeSyncCommandPayload = undefined;
      params.onSyncRunTerminal?.(completedSyncCommandPayload);
    }
    refreshSyncing();
    replayPendingSync();
  };

  const reset = () => {
    pendingSyncIntent = false;
    pendingSyncCommandPayload = undefined;
    syncRunInFlight = false;
    activeSyncCommandPayload = undefined;
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
