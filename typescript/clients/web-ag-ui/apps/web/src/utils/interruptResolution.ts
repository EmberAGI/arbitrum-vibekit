import { isAbortLikeError, isBusyRunError } from './runConcurrency';

type ResumeRunPayload = {
  forwardedProps: {
    command: {
      resume: string;
    };
  };
};

type ResumeRunner<TAgent> = (params: {
  agent: TAgent;
  payload: ResumeRunPayload;
}) => Promise<unknown> | unknown;

export async function resumeInterruptViaAgent<TAgent>(params: {
  agent: TAgent | null;
  resumePayload: string;
  runResume?: ResumeRunner<TAgent>;
  maxRetries?: number;
  retryDelayMs?: number;
}): Promise<boolean> {
  const { agent, resumePayload, runResume } = params;
  if (!agent || typeof runResume !== 'function') {
    return false;
  }

  const maxRetries = params.maxRetries ?? 2;
  const retryDelayMs = params.retryDelayMs ?? 250;

  let attempt = 0;

  while (true) {
    try {
      await Promise.resolve(
        runResume({
          agent,
          payload: {
            forwardedProps: {
              command: {
                resume: resumePayload,
              },
            },
          },
        }),
      );

      return true;
    } catch (error) {
      const shouldRetry = (isBusyRunError(error) || isAbortLikeError(error)) && attempt < maxRetries;
      if (!shouldRetry) {
        throw error;
      }

      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
