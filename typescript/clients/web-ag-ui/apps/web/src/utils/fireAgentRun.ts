import type { v7 as uuidv7 } from 'uuid';

type AgentLike = {
  addMessage: (message: { id: string; role: 'user'; content: string }) => void;
  abortRun?: () => void;
  detachActiveRun?: () => Promise<void> | void;
  isRunning?: boolean | (() => boolean);
};

type BoolRef = { current: boolean };

type HttpStatus = number | string;
type BusyError = {
  message?: string;
  status?: HttpStatus;
  statusCode?: HttpStatus;
  code?: string;
  response?: { status?: HttpStatus };
};

const FIRE_RUN_MAX_RETRIES = 5;
const FIRE_RUN_RETRY_DELAY_MS = 150;

const toStatusCode = (value: HttpStatus | undefined): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const isBusyRunError = (error: unknown): boolean => {
  const maybeBusyError = error as BusyError;
  const status = toStatusCode(
    maybeBusyError?.status ??
      maybeBusyError?.statusCode ??
      (typeof maybeBusyError?.response === 'object' ? maybeBusyError.response?.status : undefined),
  );
  if (status === 409 || status === 422) return true;

  const message = `${maybeBusyError?.message ?? ''}`.toLowerCase();
  return (
    message.includes('run_started') ||
    message.includes('already active') ||
    message.includes('already running') ||
    message.includes('thread is busy') ||
    message.includes('active run') ||
    message.includes('currently active')
  );
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isAgentRunning = (agent: AgentLike): boolean => {
  const field = agent.isRunning;
  if (typeof field === 'function') return field();
  return field === true;
};

const startFireRun = async <TAgent extends AgentLike>(
  runAgent: (agent: TAgent) => Promise<unknown>,
  abortActiveBackendRun: (() => Promise<void>) | undefined,
  agent: TAgent,
  runInFlightRef: BoolRef,
  attempt = 0,
  hasCancelledBackendRun = false,
): Promise<void> => {
  try {
    await runAgent(agent);
    return;
  } catch (error) {
    const shouldCancel = isBusyRunError(error) && !hasCancelledBackendRun && abortActiveBackendRun;
    if (shouldCancel) {
      await abortActiveBackendRun?.().catch(() => {
        // best-effort; ignore
      });
    }

    if (isBusyRunError(error) && attempt < FIRE_RUN_MAX_RETRIES - 1) {
      await sleep(FIRE_RUN_RETRY_DELAY_MS);
      return startFireRun(
        runAgent,
        abortActiveBackendRun,
        agent,
        runInFlightRef,
        attempt + 1,
        hasCancelledBackendRun || Boolean(shouldCancel),
      );
    }

    runInFlightRef.current = false;
    throw error;
  }
};

export async function fireAgentRun<TAgent extends AgentLike>(params: {
  agent: TAgent | null;
  runAgent: (agent: TAgent) => Promise<unknown>;
  abortActiveBackendRun?: () => Promise<void>;
  threadId: string | undefined;
  runInFlightRef: BoolRef;
  createId: typeof uuidv7;
}): Promise<boolean> {
  const { agent, threadId, runInFlightRef } = params;
  if (!agent || !threadId) return false;

  const uiRunInFlight = runInFlightRef.current;
  const backendRunLikelyActive = isAgentRunning(agent);

  // If an onboarding run is currently blocked at an interrupt, the hook-level guard
  // prevents new commands. `fire` is special: it must always work as an escape hatch.
  if (uiRunInFlight) {
    try {
      agent.abortRun?.();
    } finally {
      await Promise.resolve(agent.detachActiveRun?.()).catch(() => {
        // best-effort; ignore
      });
    }
  } else if (backendRunLikelyActive) {
    await Promise.resolve(agent.detachActiveRun?.()).catch(() => {
      // best-effort; ignore
    });
  }

  // Keep `runInFlightRef` true: we are immediately starting a new run.
  runInFlightRef.current = true;

  // Best-effort: if a cron/external run is currently holding the thread lock,
  // cancel it so `fire` can start immediately (better UX than waiting).
  let backendAbortAttemptSucceeded = false;
  if (params.abortActiveBackendRun) {
    try {
      await params.abortActiveBackendRun();
      backendAbortAttemptSucceeded = true;
    } catch {
      // best-effort; ignore
    }
  }

  agent.addMessage({
    id: params.createId(),
    role: 'user',
    content: JSON.stringify({ command: 'fire' }),
  });

  // Fire-and-forget with short retry if the runtime is still finalizing a previous run.
  void startFireRun(
    params.runAgent,
    params.abortActiveBackendRun,
    agent,
    runInFlightRef,
    0,
    backendAbortAttemptSucceeded,
  ).catch((error: unknown) => {
    runInFlightRef.current = false;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[fireAgentRun] Failed to start fire run', { threadId, error: message });
  });

  return true;
}
