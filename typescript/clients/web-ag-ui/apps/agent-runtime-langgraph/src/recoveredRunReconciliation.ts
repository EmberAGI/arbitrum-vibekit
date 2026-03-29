import type { MemorySaver } from '@langchain/langgraph';

import {
  restorePersistedCronSchedulesFromCheckpointer,
  type PersistedCronRecoveryCandidate,
  type ScheduleThread,
} from './persistedCronRecovery.js';

type LangGraphRun = {
  run_id: string;
  status?: string;
};

type Logger = Pick<Console, 'warn'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRun(value: unknown): LangGraphRun {
  if (!isRecord(value) || typeof value['run_id'] !== 'string') {
    throw new Error('Unexpected LangGraph run response shape');
  }

  return {
    run_id: value['run_id'],
    status: typeof value['status'] === 'string' ? value['status'] : undefined,
  };
}

function parseRunList(payload: unknown): LangGraphRun[] {
  const runList = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload['runs'])
      ? payload['runs']
      : isRecord(payload) && Array.isArray(payload['data'])
        ? payload['data']
        : undefined;

  if (!runList) {
    throw new Error('Unexpected LangGraph runs response shape');
  }

  return runList.map((candidate) => parseRun(candidate));
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const payloadText = await response.text();
  if (!response.ok) {
    throw new Error(`LangGraph API request failed (${response.status}): ${payloadText}`);
  }

  const trimmed = payloadText.trim();
  return trimmed.length > 0 ? (JSON.parse(trimmed) as unknown) : [];
}

export function isActiveLangGraphRunStatus(status: string | undefined): boolean {
  return status === 'pending' || status === 'running';
}

export async function listThreadRuns(baseUrl: string, threadId: string): Promise<LangGraphRun[]> {
  const response = await globalThis.fetch(`${baseUrl}/threads/${threadId}/runs`);
  return parseRunList(await parseJsonResponse(response));
}

export async function cancelLangGraphRun(
  baseUrl: string,
  threadId: string,
  runId: string,
  options?: { wait?: boolean },
): Promise<void> {
  const cancelUrl = new URL(`${baseUrl}/threads/${threadId}/runs/${runId}/cancel`);
  if (options?.wait) {
    cancelUrl.searchParams.set('wait', 'true');
  }

  const response = await globalThis.fetch(cancelUrl, { method: 'POST' });
  if (response.ok || response.status === 404) {
    return;
  }

  const payloadText = await response.text().catch(() => 'No error body');
  throw new Error(`LangGraph run cancel failed (${response.status}): ${payloadText}`);
}

export async function reconcileRecoveredThreadRuns(
  baseUrl: string,
  threadId: string,
  logger: Logger = console,
): Promise<LangGraphRun[]> {
  const activeRuns = (await listThreadRuns(baseUrl, threadId)).filter((run) =>
    isActiveLangGraphRunStatus(run.status),
  );
  if (activeRuns.length === 0) {
    return [];
  }

  logger.warn('[cron] Recovered thread has active runs; canceling before rescheduling', {
    threadId,
    runIds: activeRuns.map((run) => run.run_id),
    statuses: activeRuns.map((run) => run.status),
  });

  await Promise.all(
    activeRuns.map((run) => cancelLangGraphRun(baseUrl, threadId, run.run_id, { wait: true })),
  );

  return activeRuns;
}

export async function restorePersistedCronSchedulesWithRunReconciliation(params: {
  baseUrl: string;
  scheduleThread: ScheduleThread;
  logger?: Logger;
  loadCheckpointer?: () => Promise<MemorySaver>;
}): Promise<PersistedCronRecoveryCandidate[]> {
  const logger = params.logger ?? console;
  const recoveredCronThreads = await restorePersistedCronSchedulesFromCheckpointer(
    () => undefined,
    params.loadCheckpointer,
  );

  await Promise.all(
    recoveredCronThreads.map(async ({ threadId, pollIntervalMs }) => {
      try {
        await reconcileRecoveredThreadRuns(params.baseUrl, threadId, logger);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('[cron] Failed to reconcile recovered thread runs', {
          threadId,
          error: message,
        });
      }

      params.scheduleThread(threadId, pollIntervalMs);
    }),
  );

  return recoveredCronThreads;
}
