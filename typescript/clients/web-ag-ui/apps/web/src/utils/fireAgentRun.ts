import type { v7 as uuidv7 } from 'uuid';
import { isAgentRunning, isBusyRunError } from './runConcurrency';

type AgentLike = {
  addMessage: (message: { id: string; role: 'user'; content: string }) => void;
  detachActiveRun?: () => Promise<void> | void;
  isRunning?: boolean | (() => boolean);
};

type BoolRef = { current: boolean };

const FIRE_RUN_MAX_RETRIES = 5;
const FIRE_RUN_RETRY_DELAY_MS = 150;
const FIRE_PREEMPT_WAIT_MS = 1_500;
const FIRE_PREEMPT_POLL_MS = 50;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isFireDebugEnabled =
  process.env.NEXT_PUBLIC_FIRE_COMMAND_DEBUG === 'true' || process.env.NEXT_PUBLIC_LOG_LEVEL === 'debug';

export const logFireCommandDebug = (message: string, metadata: Record<string, unknown>): void => {
  if (!isFireDebugEnabled) {
    return;
  }
  console.info('[fireAgentRun][debug]', {
    ts: new Date().toISOString(),
    message,
    ...metadata,
  });
};

const logFireCommandTrace = (message: string, metadata: Record<string, unknown>): void => {
  console.warn('[fireAgentRun][trace]', {
    ts: new Date().toISOString(),
    message,
    ...metadata,
  });
};

const summarizeRunAgentResult = (value: unknown): Record<string, unknown> => {
  if (value === null) {
    return { resultType: 'null' };
  }
  if (value === undefined) {
    return { resultType: 'undefined' };
  }
  if (Array.isArray(value)) {
    return { resultType: 'array', length: value.length };
  }
  if (typeof value === 'object') {
    return {
      resultType: 'object',
      keys: Object.keys(value as Record<string, unknown>).slice(0, 12),
    };
  }
  return {
    resultType: typeof value,
    value: String(value),
  };
};

const waitForPreemptedRun = async <TAgent extends AgentLike>(params: {
  agent: TAgent;
  runInFlightRef: BoolRef;
  maxWaitMs: number;
  pollMs: number;
}): Promise<void> => {
  let elapsedMs = 0;
  while (elapsedMs < params.maxWaitMs) {
    if (!params.runInFlightRef.current && !isAgentRunning(params.agent)) {
      logFireCommandDebug('preempt wait completed early', {
        elapsedMs,
      });
      return;
    }
    await sleep(params.pollMs);
    elapsedMs += params.pollMs;
  }
  logFireCommandDebug('preempt wait elapsed without clear ownership', {
    elapsedMs,
    runInFlight: params.runInFlightRef.current,
    backendRunLikelyActive: isAgentRunning(params.agent),
  });
};

const startFireRun = async <TAgent extends AgentLike>(
  runAgent: (agent: TAgent) => Promise<unknown>,
  agent: TAgent,
  runInFlightRef: BoolRef,
  attempt = 0,
): Promise<void> => {
  try {
    logFireCommandTrace('runAgent attempt', {
      attempt: attempt + 1,
    });
    logFireCommandDebug('runAgent attempt', {
      attempt: attempt + 1,
    });
    const runResult = await runAgent(agent);
    logFireCommandTrace('runAgent accepted', {
      attempt: attempt + 1,
      runInFlight: runInFlightRef.current,
      ...summarizeRunAgentResult(runResult),
    });
    logFireCommandDebug('runAgent accepted', {
      attempt: attempt + 1,
      runInFlight: runInFlightRef.current,
      ...summarizeRunAgentResult(runResult),
    });
    return;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logFireCommandDebug('runAgent attempt failed', {
      attempt: attempt + 1,
      busy: isBusyRunError(error),
      detail,
    });
    if (isBusyRunError(error) && attempt < FIRE_RUN_MAX_RETRIES - 1) {
      await sleep(FIRE_RUN_RETRY_DELAY_MS);
      return startFireRun(runAgent, agent, runInFlightRef, attempt + 1);
    }

    runInFlightRef.current = false;
    if (isBusyRunError(error)) {
      throw new Error('Agent run is still active. Please retry in a moment.');
    }
    throw error;
  }
};

export async function fireAgentRun<TAgent extends AgentLike>(params: {
  agent: TAgent | null;
  runAgent: (agent: TAgent) => Promise<unknown>;
  preemptActiveRun?: (agent: TAgent) => Promise<void> | void;
  threadId: string | undefined;
  runInFlightRef: BoolRef;
  createId: typeof uuidv7;
  onError?: (message: string) => void;
  preemptWaitMs?: number;
  preemptPollMs?: number;
}): Promise<boolean> {
  const { agent, threadId, runInFlightRef } = params;
  if (!agent || !threadId) {
    logFireCommandDebug('fire command rejected before dispatch', {
      reason: !agent ? 'missing-agent' : 'missing-thread-id',
      threadId,
    });
    return false;
  }
  const canPreempt = typeof params.preemptActiveRun === 'function';
  let detachedOwnership = false;

  const uiRunInFlight = runInFlightRef.current;
  const backendRunLikelyActive = isAgentRunning(agent);
  logFireCommandTrace('fire command dispatch start', {
    threadId,
    uiRunInFlight,
    backendRunLikelyActive,
    canPreempt,
  });
  logFireCommandDebug('fire command dispatch start', {
    threadId,
    uiRunInFlight,
    backendRunLikelyActive,
    canPreempt,
  });

  // If an onboarding run is currently blocked at an interrupt, the hook-level guard
  // prevents new commands. `fire` is special: it must always work as an escape hatch.
  if (uiRunInFlight) {
    logFireCommandDebug('preempting due to ui in-flight ownership', {
      threadId,
    });
    await Promise.resolve(params.preemptActiveRun?.(agent))
      .then(() => {
        logFireCommandDebug('preempt active run request completed', {
          threadId,
          reason: 'ui-run-in-flight',
        });
      })
      .catch((error: unknown) => {
        logFireCommandDebug('preempt active run request failed', {
          threadId,
          reason: 'ui-run-in-flight',
          detail: error instanceof Error ? error.message : String(error),
        });
      });
    await Promise.resolve(agent.detachActiveRun?.())
      .then(() => {
        detachedOwnership = true;
        logFireCommandDebug('detach active run completed', {
          threadId,
          reason: 'ui-run-in-flight',
        });
      })
      .catch((error: unknown) => {
        logFireCommandDebug('detach active run failed', {
          threadId,
          reason: 'ui-run-in-flight',
          detail: error instanceof Error ? error.message : String(error),
        });
      });

    if (canPreempt) {
      await waitForPreemptedRun({
        agent,
        runInFlightRef,
        maxWaitMs: params.preemptWaitMs ?? FIRE_PREEMPT_WAIT_MS,
        pollMs: params.preemptPollMs ?? FIRE_PREEMPT_POLL_MS,
      });
    }
  } else if (backendRunLikelyActive) {
    logFireCommandDebug('preempting due to backend active run', {
      threadId,
    });
    await Promise.resolve(params.preemptActiveRun?.(agent))
      .then(() => {
        logFireCommandDebug('preempt active run request completed', {
          threadId,
          reason: 'backend-run-active',
        });
      })
      .catch((error: unknown) => {
        logFireCommandDebug('preempt active run request failed', {
          threadId,
          reason: 'backend-run-active',
          detail: error instanceof Error ? error.message : String(error),
        });
      });
    await Promise.resolve(agent.detachActiveRun?.())
      .then(() => {
        detachedOwnership = true;
        logFireCommandDebug('detach active run completed', {
          threadId,
          reason: 'backend-run-active',
        });
      })
      .catch((error: unknown) => {
        logFireCommandDebug('detach active run failed', {
          threadId,
          reason: 'backend-run-active',
          detail: error instanceof Error ? error.message : String(error),
        });
      });

    if (canPreempt) {
      await waitForPreemptedRun({
        agent,
        runInFlightRef,
        maxWaitMs: params.preemptWaitMs ?? FIRE_PREEMPT_WAIT_MS,
        pollMs: params.preemptPollMs ?? FIRE_PREEMPT_POLL_MS,
      });
    }
  }

  if (!detachedOwnership) {
    await Promise.resolve(agent.detachActiveRun?.())
      .then(() => {
        detachedOwnership = true;
        logFireCommandDebug('detach active run completed', {
          threadId,
          reason: 'stale-ownership-clear',
        });
      })
      .catch((error: unknown) => {
        logFireCommandDebug('detach active run failed', {
          threadId,
          reason: 'stale-ownership-clear',
          detail: error instanceof Error ? error.message : String(error),
        });
      });
  }

  // Keep `runInFlightRef` true: we are immediately starting a new run.
  runInFlightRef.current = true;
  logFireCommandTrace('enqueueing fire message', {
    threadId,
    runInFlight: runInFlightRef.current,
  });
  logFireCommandDebug('enqueueing fire message', {
    threadId,
    runInFlight: runInFlightRef.current,
  });

  const fireClientMutationId = params.createId();
  agent.addMessage({
    id: params.createId(),
    role: 'user',
    content: JSON.stringify({ command: 'fire', clientMutationId: fireClientMutationId }),
  });

  // Fire-and-forget with short retry if the runtime is still finalizing a previous run.
  logFireCommandDebug('starting fire run dispatch', {
    threadId,
  });
  void startFireRun(params.runAgent, agent, runInFlightRef, 0).catch((error: unknown) => {
    runInFlightRef.current = false;
    const message = error instanceof Error ? error.message : String(error);
    logFireCommandTrace('runAgent failed', {
      threadId,
      detail: message,
    });
    console.error('[fireAgentRun] Failed to start fire run', { threadId, error: message });
    params.onError?.(message);
  });

  return true;
}
