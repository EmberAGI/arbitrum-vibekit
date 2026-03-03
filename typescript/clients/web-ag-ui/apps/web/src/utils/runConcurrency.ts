type HttpStatus = number | string;

type BusyError = {
  message?: string;
  name?: string;
  status?: HttpStatus;
  statusCode?: HttpStatus;
  code?: string;
  response?: { status?: HttpStatus };
};

type RunAwareAgent = {
  isRunning?: boolean | (() => boolean);
};

function toStatusCode(value: HttpStatus | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function isBusyRunError(error: unknown): boolean {
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
}

export function isAbortLikeError(error: unknown): boolean {
  const maybeError = error as BusyError;
  const status = toStatusCode(
    maybeError?.status ??
      maybeError?.statusCode ??
      (typeof maybeError?.response === 'object' ? maybeError.response?.status : undefined),
  );
  if (status === 499) return true;

  const name = `${maybeError?.name ?? ''}`.toLowerCase();
  if (name.includes('abort')) return true;

  const message = `${maybeError?.message ?? ''}`.toLowerCase();
  return (
    message.includes('aborterror') ||
    message.includes('aborted') ||
    message.includes('abort') ||
    message.includes('bodystreambuffer')
  );
}

export function isAgentRunning(agent: RunAwareAgent): boolean {
  const field = agent.isRunning;
  if (typeof field === 'function') return field();
  return field === true;
}
