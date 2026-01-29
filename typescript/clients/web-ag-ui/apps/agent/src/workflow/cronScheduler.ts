import cron, { type ScheduledTask } from 'node-cron';

import { resolvePollIntervalMs } from '../config/constants.js';

type CronExecutor = (threadId: string) => Promise<void> | void;

let executor: CronExecutor | undefined;
const cronJobs = new Map<string, ScheduledTask>();

function toCronExpression(intervalMs: number): string {
  const intervalSeconds = Math.max(1, Math.round(intervalMs / 1000));
  if (intervalSeconds < 60) {
    return `*/${intervalSeconds} * * * * *`;
  }

  if (intervalSeconds % 60 === 0) {
    const minutes = Math.max(1, Math.floor(intervalSeconds / 60));
    return `0 */${minutes} * * * *`;
  }

  const clampedSeconds = Math.min(59, intervalSeconds);
  console.warn(
    `[cron] Requested interval ${intervalMs}ms is not a clean minute multiple; clamping to ${clampedSeconds}s cron schedule.`,
  );
  return `*/${clampedSeconds} * * * * *`;
}

function resolveCronExpression(intervalMs?: number): string {
  const interval = intervalMs ?? resolvePollIntervalMs();
  return toCronExpression(interval);
}

export function configureCronExecutor(fn: CronExecutor) {
  executor = fn;
}

export function ensureCronForThread(threadId: string, intervalMs?: number) {
  if (!executor) {
    console.warn('[cron] Executor not configured; skipping cron scheduling', { threadId });
    return undefined;
  }

  if (cronJobs.has(threadId)) {
    console.info('[cron] Cron already scheduled; skipping duplicate request', { threadId });
    return cronJobs.get(threadId);
  }

  const resolvedInterval = intervalMs ?? resolvePollIntervalMs();
  const cronExpression = resolveCronExpression(resolvedInterval);
  console.info('[cron] Scheduling mock CLMM graph', {
    threadId,
    cron: cronExpression,
    intervalMs: resolvedInterval,
  });
  const job = cron.schedule(cronExpression, () => {
    console.info('[cron] Tick', { threadId, cron: cronExpression });
    void executor?.(threadId);
  });
  cronJobs.set(threadId, job);
  return job;
}

export function cancelCronForThread(threadId: string) {
  const existing = cronJobs.get(threadId);
  if (existing) {
    void existing.stop();
    cronJobs.delete(threadId);
    console.info(`[cron] Canceled cron for thread=${threadId}`);
  }
}
