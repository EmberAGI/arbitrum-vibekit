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
  agent: TAgent,
  runInFlightRef: BoolRef,
  attempt = 0,
): Promise<void> => {
  try {
    await runAgent(agent);
    return;
  } catch (error) {
    if (isBusyRunError(error) && attempt < FIRE_RUN_MAX_RETRIES - 1) {
      await sleep(FIRE_RUN_RETRY_DELAY_MS);
      return startFireRun(runAgent, agent, runInFlightRef, attempt + 1);
    }

    runInFlightRef.current = false;
    throw error;
  }
};

export async function fireAgentRun<TAgent extends AgentLike>(params: {
  agent: TAgent | null;
  runAgent: (agent: TAgent) => Promise<unknown>;
  threadId: string | undefined;
  runInFlightRef: BoolRef;
  createId: typeof uuidv7;
  onError?: (message: string) => void;
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

  agent.addMessage({
    id: params.createId(),
    role: 'user',
    content: JSON.stringify({ command: 'fire' }),
  });

  // Fire-and-forget with short retry if the runtime is still finalizing a previous run.
  void startFireRun(params.runAgent, agent, runInFlightRef, 0).catch((error: unknown) => {
    runInFlightRef.current = false;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[fireAgentRun] Failed to start fire run', { threadId, error: message });
    params.onError?.(message);
  });

  return true;
}
