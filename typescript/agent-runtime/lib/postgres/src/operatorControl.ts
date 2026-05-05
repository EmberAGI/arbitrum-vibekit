import { recoverPendingOutboxIntents, type PiOutboxRecoveryRecord } from './outbox.js';
import {
  buildRestartRecoveryPlan,
  type PiRestartExecutionRecord,
  type PiRestartInterruptRecord,
  type PiRestartRecoveryPlan,
} from './recovery.js';
import {
  recoverDueAutomations,
  type PiAutomationScheduleRecord,
  type PiSchedulerLeaseRecord,
} from './schedulerLease.js';

export type PiThreadRecord = {
  threadId: string;
  threadKey: string;
  status: string;
  threadState: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type PiExecutionRecord = {
  executionId: string;
  threadId: string;
  automationRunId: string | null;
  status: PiRestartExecutionRecord['status'];
  source: 'user' | 'automation' | 'system';
  currentInterruptId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type PiAutomationRecord = {
  automationId: string;
  threadId: string;
  commandName: string;
  cadence: string;
  schedulePayload: Record<string, unknown>;
  suspended: boolean;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PiAutomationRunRecord = {
  runId: string;
  automationId: string;
  threadId: string;
  executionId: string | null;
  status: 'scheduled' | 'started' | 'running' | 'completed' | 'failed' | 'timed_out' | 'canceled';
  scheduledAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type PiExecutionEventRecord = {
  eventId: string;
  executionId: string;
  threadId: string;
  eventKind: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

export type PiThreadActivityRecord = {
  activityId: string;
  threadId: string;
  executionId: string | null;
  activityKind: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

export type PiArtifactRecord = {
  artifactId: string;
  threadId: string;
  executionId: string | null;
  artifactKind: string;
  appendOnly: boolean;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type PiRuntimeInspectionSnapshot = {
  threads: readonly PiThreadRecord[];
  executions: readonly PiExecutionRecord[];
  automations: readonly PiAutomationRecord[];
  automationRuns: readonly PiAutomationRunRecord[];
  interrupts: readonly PiRestartInterruptRecord[];
  executionEvents: readonly PiExecutionEventRecord[];
  threadActivities: readonly PiThreadActivityRecord[];
  artifacts: readonly PiArtifactRecord[];
  scheduler: {
    leases: readonly PiSchedulerLeaseRecord[];
    dueAutomationIds: string[];
  };
  outbox: {
    intents: readonly PiOutboxRecoveryRecord[];
    dueOutboxIds: string[];
  };
  health: {
    status: 'ok' | 'degraded';
    dueAutomationIds: string[];
    dueOutboxIds: string[];
    interruptedExecutionIds: string[];
    pendingInterruptIds: string[];
  };
};

export type PiRuntimeRetentionPolicy = {
  completedExecutionMs: number;
  completedAutomationRunMs: number;
  executionEventMs: number;
  threadActivityMs: number;
};

export type PiRuntimeMaintenancePlan = {
  recovery: PiRestartRecoveryPlan;
  archival: {
    executionIds: string[];
    automationRunIds: string[];
    executionEventIds: string[];
    threadActivityIds: string[];
  };
};

const executionStatusPriority: Record<PiExecutionRecord['status'], number> = {
  interrupted: 0,
  working: 1,
  queued: 2,
  failed: 3,
  completed: 4,
};

const compareDatesDescending = (left: Date, right: Date): number => right.getTime() - left.getTime();

const toRestartExecutionRecord = (execution: PiExecutionRecord): PiRestartExecutionRecord => ({
  executionId: execution.executionId,
  threadId: execution.threadId,
  status: execution.status,
  currentInterruptId: execution.currentInterruptId,
});

const toAutomationScheduleRecord = (automation: PiAutomationRecord): PiAutomationScheduleRecord => ({
  automationId: automation.automationId,
  nextRunAt: automation.nextRunAt,
  suspended: automation.suspended,
});

const isOlderThan = (now: Date, candidate: Date | null, maxAgeMs: number): boolean =>
  candidate !== null && now.getTime() - candidate.getTime() >= maxAgeMs;

export function buildPiRuntimeInspectionSnapshot(params: {
  now: Date;
  threads: readonly PiThreadRecord[];
  executions: readonly PiExecutionRecord[];
  automations: readonly PiAutomationRecord[];
  automationRuns: readonly PiAutomationRunRecord[];
  interrupts: readonly PiRestartInterruptRecord[];
  leases: readonly PiSchedulerLeaseRecord[];
  outboxIntents: readonly PiOutboxRecoveryRecord[];
  executionEvents: readonly PiExecutionEventRecord[];
  threadActivities: readonly PiThreadActivityRecord[];
  artifacts?: readonly PiArtifactRecord[];
}): PiRuntimeInspectionSnapshot {
  const dueAutomationIds = recoverDueAutomations({
    now: params.now,
    automations: params.automations.map(toAutomationScheduleRecord),
    leases: params.leases,
  });
  const dueOutboxIds = recoverPendingOutboxIntents({
    now: params.now,
    intents: params.outboxIntents,
  }).map((intent) => intent.outboxId);
  const interruptedExecutionIds = params.executions
    .filter((execution) => execution.status === 'interrupted')
    .map((execution) => execution.executionId);
  const pendingInterruptIds = params.interrupts
    .filter((interrupt) => interrupt.status === 'pending' && interrupt.mirroredToActivity)
    .map((interrupt) => interrupt.interruptId);

  return {
    threads: [...params.threads].sort((left, right) => compareDatesDescending(left.updatedAt, right.updatedAt)),
    executions: [...params.executions].sort((left, right) => {
      const priorityDifference = executionStatusPriority[left.status] - executionStatusPriority[right.status];
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
      return compareDatesDescending(left.updatedAt, right.updatedAt);
    }),
    automations: [...params.automations].sort((left, right) => compareDatesDescending(left.updatedAt, right.updatedAt)),
    automationRuns: [...params.automationRuns].sort((left, right) =>
      compareDatesDescending(left.scheduledAt, right.scheduledAt),
    ),
    interrupts: [...params.interrupts],
    executionEvents: [...params.executionEvents].sort((left, right) =>
      compareDatesDescending(left.createdAt, right.createdAt),
    ),
    threadActivities: [...params.threadActivities].sort((left, right) =>
      compareDatesDescending(left.createdAt, right.createdAt),
    ),
    artifacts: [...(params.artifacts ?? [])].sort((left, right) =>
      compareDatesDescending(left.updatedAt, right.updatedAt),
    ),
    scheduler: {
      leases: [...params.leases].sort((left, right) => compareDatesDescending(left.leaseExpiresAt, right.leaseExpiresAt)),
      dueAutomationIds,
    },
    outbox: {
      intents: [...params.outboxIntents].sort((left, right) => compareDatesDescending(left.availableAt, right.availableAt)),
      dueOutboxIds,
    },
    health: {
      status:
        dueAutomationIds.length > 0 ||
        dueOutboxIds.length > 0 ||
        interruptedExecutionIds.length > 0 ||
        pendingInterruptIds.length > 0
          ? 'degraded'
          : 'ok',
      dueAutomationIds,
      dueOutboxIds,
      interruptedExecutionIds,
      pendingInterruptIds,
    },
  };
}

export function buildPiRuntimeMaintenancePlan(params: {
  now: Date;
  snapshot: PiRuntimeInspectionSnapshot;
  retention: PiRuntimeRetentionPolicy;
}): PiRuntimeMaintenancePlan {
  return {
    recovery: buildRestartRecoveryPlan({
      now: params.now,
      automations: params.snapshot.automations.map(toAutomationScheduleRecord),
      leases: params.snapshot.scheduler.leases,
      executions: params.snapshot.executions.map(toRestartExecutionRecord),
      outboxIntents: params.snapshot.outbox.intents,
      interrupts: params.snapshot.interrupts,
    }),
    archival: {
      executionIds: params.snapshot.executions
        .filter(
          (execution) =>
            execution.status === 'completed' &&
            isOlderThan(params.now, execution.completedAt, params.retention.completedExecutionMs),
        )
        .map((execution) => execution.executionId),
      automationRunIds: params.snapshot.automationRuns
        .filter((run) => run.status === 'completed' && isOlderThan(params.now, run.completedAt, params.retention.completedAutomationRunMs))
        .map((run) => run.runId),
      executionEventIds: params.snapshot.executionEvents
        .filter((event) => isOlderThan(params.now, event.createdAt, params.retention.executionEventMs))
        .map((event) => event.eventId),
      threadActivityIds: params.snapshot.threadActivities
        .filter((activity) => isOlderThan(params.now, activity.createdAt, params.retention.threadActivityMs))
        .map((activity) => activity.activityId),
    },
  };
}
