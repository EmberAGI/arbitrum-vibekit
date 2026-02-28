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
    options?: {
      allowSyncCoalesce?: boolean;
      isReplayAttempt?: boolean;
      messagePayload?: Record<string, unknown>;
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
  let pendingSyncMessagePayload: Record<string, unknown> | undefined;
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
    options?: {
      allowSyncCoalesce?: boolean;
      isReplayAttempt?: boolean;
      messagePayload?: Record<string, unknown>;
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
      if (command === 'sync' && options?.allowSyncCoalesce) {
        pendingSyncIntent = true;
        pendingSyncMessagePayload = options.messagePayload;
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

    if (command === 'sync') {
      syncRunInFlight = true;
      pendingSyncIntent = false;
      pendingSyncMessagePayload = options?.messagePayload;
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
    options?: {
      allowSyncCoalesce?: boolean;
      isReplayAttempt?: boolean;
      messagePayload?: Record<string, unknown>;
    },
  ): boolean => {
    return dispatchRun({
      command,
      options,
      beforeRun: (agent) => {
        const payload = options?.messagePayload ?? {};
        const hasClientMutationId =
          typeof payload['clientMutationId'] === 'string' &&
          (payload['clientMutationId'] as string).length > 0;
        const messagePayload = hasClientMutationId
          ? payload
          : {
              ...payload,
              clientMutationId: params.createId(),
            };
        agent.addMessage({
          id: params.createId(),
          role: 'user',
          content: JSON.stringify({
            command,
            ...messagePayload,
          }),
        });
      },
      run: params.runAgent,
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
    void dispatch('sync', {
      allowSyncCoalesce: true,
      isReplayAttempt: true,
      messagePayload: pendingSyncMessagePayload,
    });
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
    pendingSyncMessagePayload = undefined;
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
