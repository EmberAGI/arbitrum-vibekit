type SchedulableAgent = {
  isRunning?: boolean | (() => boolean);
};

type CommandPayload = Record<string, unknown>;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface AgentCommandScheduler<TAgent extends SchedulableAgent> {
  dispatch(
    command: string,
    options?: {
      allowRefreshCoalesce?: boolean;
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
  onRefreshingChange: (isRefreshing: boolean) => void;
  onRefreshRunTerminal?: (commandPayload?: CommandPayload) => void;
  onCommandError?: (command: string, error: unknown) => void;
  onCommandBusy?: (command: string, error: unknown) => void;
  refreshReplayDelayMs?: number;
  refreshBusyMaxRetries?: number;
  setTimer?: (callback: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}): AgentCommandScheduler<TAgent> {
  const refreshReplayDelayMs = params.refreshReplayDelayMs ?? 500;
  const refreshBusyMaxRetries = params.refreshBusyMaxRetries ?? 3;
  const setTimer = params.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = params.clearTimer ?? ((handle: TimerHandle) => clearTimeout(handle));

  let pendingRefreshIntent = false;
  let pendingRefreshCommandPayload: CommandPayload | undefined;
  let refreshRunInFlight = false;
  let activeRefreshCommandPayload: CommandPayload | undefined;
  let refreshBusyRetries = 0;
  let replayTimer: TimerHandle | null = null;

  const updateRefreshing = () => {
    params.onRefreshingChange(pendingRefreshIntent || refreshRunInFlight);
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
      allowRefreshCoalesce?: boolean;
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
      if (command === 'refresh' && options?.allowRefreshCoalesce) {
        pendingRefreshIntent = true;
        pendingRefreshCommandPayload = options.commandPayload;
        updateRefreshing();
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
      refreshRunInFlight = true;
      activeRefreshCommandPayload = options?.commandPayload;
      pendingRefreshIntent = false;
      pendingRefreshCommandPayload = options?.commandPayload;
      if (!options?.isReplayAttempt) {
        refreshBusyRetries = 0;
      }
      clearReplayTimer();
      updateRefreshing();
    }

    beforeRun?.(agent);

    void Promise.resolve(run(agent)).catch((error) => {
      params.setRunInFlight(false);

      if (command === 'refresh') {
        refreshRunInFlight = false;
        activeRefreshCommandPayload = undefined;

        const busy = params.isBusyRunError(error) || params.isAgentRunning(agent);
        const aborted = params.isAbortLikeError?.(error) ?? false;
        if ((busy || aborted) && refreshBusyRetries < refreshBusyMaxRetries) {
          refreshBusyRetries += 1;
          pendingRefreshIntent = true;
          updateRefreshing();

          if (replayTimer === null) {
            replayTimer = setTimer(() => {
              replayTimer = null;
              replayPendingRefresh();
            }, refreshReplayDelayMs);
          }
          return;
        }

        pendingRefreshIntent = false;
        refreshBusyRetries = 0;
        updateRefreshing();
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
      allowRefreshCoalesce?: boolean;
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

  const replayPendingRefresh = () => {
    if (!pendingRefreshIntent) return;
    if (params.getRunInFlight()) return;
    void dispatch('refresh', {
      allowRefreshCoalesce: true,
      isReplayAttempt: true,
      commandPayload: pendingRefreshCommandPayload,
    });
  };

  const handleRunTerminal = () => {
    params.setRunInFlight(false);
    refreshBusyRetries = 0;
    if (refreshRunInFlight) {
      const completedRefreshCommandPayload = activeRefreshCommandPayload;
      refreshRunInFlight = false;
      activeRefreshCommandPayload = undefined;
      params.onRefreshRunTerminal?.(completedRefreshCommandPayload);
    }
    updateRefreshing();
    replayPendingRefresh();
  };

  const reset = () => {
    pendingRefreshIntent = false;
    pendingRefreshCommandPayload = undefined;
    refreshRunInFlight = false;
    activeRefreshCommandPayload = undefined;
    refreshBusyRetries = 0;
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
