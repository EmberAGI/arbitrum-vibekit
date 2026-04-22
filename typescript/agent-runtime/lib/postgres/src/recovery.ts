import { recoverPendingOutboxIntents, type PiOutboxRecoveryRecord } from './outbox.js';
import {
  recoverDueAutomations,
  type PiAutomationScheduleRecord,
  type PiSchedulerLeaseRecord,
} from './schedulerLease.js';

export type PiRestartInterruptRecord = {
  interruptId: string;
  executionId: string;
  threadId: string;
  status: 'pending' | 'resolved';
  mirroredToActivity: boolean;
};

export type PiRestartExecutionRecord = {
  executionId: string;
  threadId: string;
  status: 'queued' | 'working' | 'interrupted' | 'completed' | 'failed';
  currentInterruptId: string | null;
};

export type PiRestartRecoveryPlan = {
  automationIdsToResume: string[];
  executionIdsToResume: string[];
  outboxIdsToReplay: string[];
  interruptIdsToResurface: string[];
};

export function buildRestartRecoveryPlan(params: {
  now: Date;
  automations: readonly PiAutomationScheduleRecord[];
  leases: readonly PiSchedulerLeaseRecord[];
  executions: readonly PiRestartExecutionRecord[];
  outboxIntents: readonly PiOutboxRecoveryRecord[];
  interrupts: readonly PiRestartInterruptRecord[];
}): PiRestartRecoveryPlan {
  const executionById = new Map(
    params.executions.map((execution) => [execution.executionId, execution]),
  );

  return {
    automationIdsToResume: recoverDueAutomations({
      now: params.now,
      automations: params.automations,
      leases: params.leases,
    }),
    executionIdsToResume: params.executions
      .filter(
        (execution) =>
          execution.status === 'queued' ||
          (execution.status === 'working' && execution.currentInterruptId === null),
      )
      .map((execution) => execution.executionId),
    outboxIdsToReplay: recoverPendingOutboxIntents({
      now: params.now,
      intents: params.outboxIntents,
    }).map((intent) => intent.outboxId),
    interruptIdsToResurface: params.interrupts
      .filter((interrupt) => {
        if (interrupt.status !== 'pending' || !interrupt.mirroredToActivity) {
          return false;
        }

        const execution = executionById.get(interrupt.executionId);
        return (
          execution?.status === 'interrupted' &&
          execution.currentInterruptId === interrupt.interruptId
        );
      })
      .map((interrupt) => interrupt.interruptId),
  };
}
