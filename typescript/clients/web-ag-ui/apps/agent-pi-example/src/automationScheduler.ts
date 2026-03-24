import {
  buildCompleteAutomationExecutionStatements,
  buildPiRuntimeStableUuid,
  executePostgresStatements,
  loadPiRuntimeInspectionState,
  recoverDueAutomations,
  type ExecutePostgresStatements,
  type LoadedPiRuntimeInspectionState,
} from 'agent-runtime';

import { applyAutomationStatusUpdate, type PiExampleRuntimeStateStore } from './runtimeState.js';

const DEFAULT_POLL_INTERVAL_MS = 1_000;

type LoadInspectionState = () => Promise<LoadedPiRuntimeInspectionState>;

export type PiExampleAutomationScheduler = {
  stop: () => void;
};

type RunPiExampleAutomationSchedulerTickOptions = {
  databaseUrl: string;
  runtimeState: PiExampleRuntimeStateStore;
  loadInspectionState?: LoadInspectionState;
  executeStatements?: ExecutePostgresStatements;
  now?: () => Date;
};

type StartPiExampleAutomationSchedulerOptions = RunPiExampleAutomationSchedulerTickOptions & {
  pollIntervalMs?: number;
};

function getCadenceMinutes(schedulePayload: Record<string, unknown>): number | null {
  const minutes = schedulePayload.minutes;
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

function findScheduledRun(
  inspectionState: LoadedPiRuntimeInspectionState,
  automationId: string,
): LoadedPiRuntimeInspectionState['automationRuns'][number] | undefined {
  return [...inspectionState.automationRuns]
    .filter((run) => run.automationId === automationId && run.status === 'scheduled' && run.executionId !== null)
    .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())[0];
}

export async function runPiExampleAutomationSchedulerTick(
  options: RunPiExampleAutomationSchedulerTickOptions,
): Promise<{ executedAutomationIds: string[] }> {
  const now = options.now?.() ?? new Date();
  const inspectionState = await (options.loadInspectionState ??
    (() =>
      loadPiRuntimeInspectionState({
        databaseUrl: options.databaseUrl,
      })))();
  const dueAutomationIds = recoverDueAutomations({
    now,
    automations: inspectionState.automations.map((automation) => ({
      automationId: automation.automationId,
      nextRunAt: automation.nextRunAt,
      suspended: automation.suspended,
    })),
    leases: inspectionState.leases,
  });
  const threadById = new Map(inspectionState.threads.map((thread) => [thread.threadId, thread]));
  const executeStatements = options.executeStatements ?? executePostgresStatements;
  const executedAutomationIds: string[] = [];

  for (const automationId of dueAutomationIds) {
    const automation = inspectionState.automations.find((candidate) => candidate.automationId === automationId);
    const scheduledRun = findScheduledRun(inspectionState, automationId);
    if (!automation || !scheduledRun?.executionId) {
      continue;
    }

    const thread = threadById.get(automation.threadId);
    const minutes = getCadenceMinutes(automation.schedulePayload);
    if (!thread || minutes === null) {
      continue;
    }

    const nextRunAt = new Date(now.getTime() + minutes * 60 * 1000);
    const nextRunId = buildPiRuntimeStableUuid('automation-run', `pi-example:${automationId}:run:${nextRunAt.toISOString()}`);
    const nextExecutionId = buildPiRuntimeStableUuid(
      'execution',
      `pi-example:${automationId}:execution:${nextRunAt.toISOString()}`,
    );
    const eventId = buildPiRuntimeStableUuid('execution-event', `pi-example:${automationId}:event:${now.toISOString()}`);
    const activityId = buildPiRuntimeStableUuid('activity', `pi-example:${automationId}:activity:${now.toISOString()}`);
    const artifactId = buildPiRuntimeStableUuid('artifact', `pi-example:${thread.threadKey}:automation-artifact`);

    applyAutomationStatusUpdate({
      runtimeState: options.runtimeState,
      threadKey: thread.threadKey,
      artifactId,
      automationId,
      executionId: scheduledRun.executionId,
      activityRunId: scheduledRun.runId,
      status: 'running',
      command: automation.commandName,
      minutes,
      detail: `Running automation ${automation.commandName}.`,
      emitConnectUpdate: true,
    });

    await executeStatements(
      options.databaseUrl,
      buildCompleteAutomationExecutionStatements({
        automationId,
        currentRunId: scheduledRun.runId,
        currentExecutionId: scheduledRun.executionId,
        nextRunId,
        nextExecutionId,
        threadId: automation.threadId,
        commandName: automation.commandName,
        schedulePayload: automation.schedulePayload,
        eventId,
        activityId,
        now,
        nextRunAt,
        leaseExpiresAt: now,
      }),
    );

    applyAutomationStatusUpdate({
      runtimeState: options.runtimeState,
      threadKey: thread.threadKey,
      artifactId,
      automationId,
      executionId: scheduledRun.executionId,
      activityRunId: scheduledRun.runId,
      status: 'completed',
      command: automation.commandName,
      minutes,
      detail: `Automation ${automation.commandName} executed successfully.`,
      emitConnectUpdate: true,
    });
    executedAutomationIds.push(automationId);
  }

  return {
    executedAutomationIds,
  };
}

export function startPiExampleAutomationScheduler(
  options: StartPiExampleAutomationSchedulerOptions,
): PiExampleAutomationScheduler {
  let tickInFlight = false;
  const runTick = async () => {
    if (tickInFlight) {
      return;
    }

    tickInFlight = true;
    try {
      await runPiExampleAutomationSchedulerTick(options);
    } finally {
      tickInFlight = false;
    }
  };

  void runTick();
  const timer = setInterval(() => {
    void runTick();
  }, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);

  return {
    stop: () => {
      clearInterval(timer);
    },
  };
}
