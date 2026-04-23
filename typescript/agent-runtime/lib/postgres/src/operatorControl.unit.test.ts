import { describe, expect, it } from 'vitest';

import { buildPiRuntimeInspectionSnapshot, buildPiRuntimeMaintenancePlan } from './operatorControl.js';

describe('operatorControl', () => {
  it('builds operator inspection snapshots from canonical runtime records instead of transport logs', () => {
    const now = new Date('2026-03-20T18:00:00.000Z');

    const snapshot = buildPiRuntimeInspectionSnapshot({
      now,
      threads: [
        {
          threadId: 'thread-1',
          threadKey: 'wallet:1',
          status: 'active',
          threadState: { phase: 'active' },
          createdAt: new Date('2026-03-20T16:00:00.000Z'),
          updatedAt: new Date('2026-03-20T17:59:00.000Z'),
        },
      ],
      executions: [
        {
          executionId: 'exec-working',
          threadId: 'thread-1',
          automationRunId: null,
          status: 'working',
          source: 'user',
          currentInterruptId: null,
          createdAt: new Date('2026-03-20T17:40:00.000Z'),
          updatedAt: new Date('2026-03-20T17:59:00.000Z'),
          completedAt: null,
        },
        {
          executionId: 'exec-interrupted',
          threadId: 'thread-1',
          automationRunId: 'run-1',
          status: 'interrupted',
          source: 'automation',
          currentInterruptId: 'interrupt-1',
          createdAt: new Date('2026-03-20T17:20:00.000Z'),
          updatedAt: new Date('2026-03-20T17:55:00.000Z'),
          completedAt: null,
        },
      ],
      automations: [
        {
          automationId: 'automation-due',
          threadId: 'thread-1',
          commandName: 'sync',
          cadence: 'interval',
          schedulePayload: { minutes: 5 },
          suspended: false,
          nextRunAt: new Date('2026-03-20T17:45:00.000Z'),
          createdAt: new Date('2026-03-20T16:00:00.000Z'),
          updatedAt: new Date('2026-03-20T17:40:00.000Z'),
        },
        {
          automationId: 'automation-suspended',
          threadId: 'thread-1',
          commandName: 'rebalance',
          cadence: 'interval',
          schedulePayload: { minutes: 15 },
          suspended: true,
          nextRunAt: new Date('2026-03-20T17:40:00.000Z'),
          createdAt: new Date('2026-03-20T16:00:00.000Z'),
          updatedAt: new Date('2026-03-20T17:40:00.000Z'),
        },
      ],
      automationRuns: [
        {
          runId: 'run-1',
          automationId: 'automation-due',
          threadId: 'thread-1',
          executionId: 'exec-interrupted',
          status: 'started',
          scheduledAt: new Date('2026-03-20T17:20:00.000Z'),
          startedAt: new Date('2026-03-20T17:21:00.000Z'),
          completedAt: null,
        },
      ],
      interrupts: [
        {
          interruptId: 'interrupt-1',
          executionId: 'exec-interrupted',
          threadId: 'thread-1',
          status: 'pending',
          mirroredToActivity: true,
        },
      ],
      leases: [],
      outboxIntents: [
        {
          outboxId: 'outbox-due',
          status: 'pending',
          availableAt: new Date('2026-03-20T17:30:00.000Z'),
          deliveredAt: null,
        },
      ],
      executionEvents: [
        {
          eventId: 'event-old',
          executionId: 'exec-interrupted',
          threadId: 'thread-1',
          eventKind: 'outbox-intent',
          createdAt: new Date('2026-03-19T17:00:00.000Z'),
        },
      ],
      threadActivities: [
        {
          activityId: 'activity-old',
          threadId: 'thread-1',
          executionId: 'exec-interrupted',
          activityKind: 'automation-dispatch',
          createdAt: new Date('2026-03-19T17:00:00.000Z'),
        },
      ],
    });

    expect(snapshot.health).toEqual({
      status: 'degraded',
      dueAutomationIds: ['automation-due'],
      dueOutboxIds: ['outbox-due'],
      interruptedExecutionIds: ['exec-interrupted'],
      pendingInterruptIds: ['interrupt-1'],
    });
    expect(snapshot.scheduler).toEqual({
      dueAutomationIds: ['automation-due'],
      leases: [],
    });
    expect(snapshot.outbox).toEqual({
      dueOutboxIds: ['outbox-due'],
      intents: [
        {
          outboxId: 'outbox-due',
          status: 'pending',
          availableAt: new Date('2026-03-20T17:30:00.000Z'),
          deliveredAt: null,
        },
      ],
    });
    expect(snapshot.executions.map((execution) => execution.executionId)).toEqual([
      'exec-interrupted',
      'exec-working',
    ]);
  });

  it('builds maintenance plans for replay, resurface, resume, and retention workflows', () => {
    const now = new Date('2026-03-20T18:00:00.000Z');

    const snapshot = buildPiRuntimeInspectionSnapshot({
      now,
      threads: [],
      executions: [
        {
          executionId: 'exec-queued',
          threadId: 'thread-1',
          automationRunId: null,
          status: 'queued',
          source: 'user',
          currentInterruptId: null,
          createdAt: new Date('2026-03-20T17:30:00.000Z'),
          updatedAt: new Date('2026-03-20T17:40:00.000Z'),
          completedAt: null,
        },
        {
          executionId: 'exec-completed-old',
          threadId: 'thread-1',
          automationRunId: 'run-completed-old',
          status: 'completed',
          source: 'automation',
          currentInterruptId: null,
          createdAt: new Date('2026-03-18T17:00:00.000Z'),
          updatedAt: new Date('2026-03-18T18:00:00.000Z'),
          completedAt: new Date('2026-03-18T18:00:00.000Z'),
        },
        {
          executionId: 'exec-interrupted',
          threadId: 'thread-1',
          automationRunId: null,
          status: 'interrupted',
          source: 'user',
          currentInterruptId: 'interrupt-1',
          createdAt: new Date('2026-03-20T17:35:00.000Z'),
          updatedAt: new Date('2026-03-20T17:50:00.000Z'),
          completedAt: null,
        },
      ],
      automations: [
        {
          automationId: 'automation-due',
          threadId: 'thread-1',
          commandName: 'sync',
          cadence: 'interval',
          schedulePayload: {},
          suspended: false,
          nextRunAt: new Date('2026-03-20T17:45:00.000Z'),
          createdAt: new Date('2026-03-19T18:00:00.000Z'),
          updatedAt: new Date('2026-03-20T17:45:00.000Z'),
        },
      ],
      automationRuns: [
        {
          runId: 'run-completed-old',
          automationId: 'automation-due',
          threadId: 'thread-1',
          executionId: 'exec-completed-old',
          status: 'completed',
          scheduledAt: new Date('2026-03-18T17:00:00.000Z'),
          startedAt: new Date('2026-03-18T17:05:00.000Z'),
          completedAt: new Date('2026-03-18T18:00:00.000Z'),
        },
      ],
      interrupts: [
        {
          interruptId: 'interrupt-1',
          executionId: 'exec-interrupted',
          threadId: 'thread-1',
          status: 'pending',
          mirroredToActivity: true,
        },
      ],
      leases: [],
      outboxIntents: [
        {
          outboxId: 'outbox-due',
          status: 'pending',
          availableAt: new Date('2026-03-20T17:30:00.000Z'),
          deliveredAt: null,
        },
      ],
      executionEvents: [
        {
          eventId: 'event-old',
          executionId: 'exec-completed-old',
          threadId: 'thread-1',
          eventKind: 'outbox-intent',
          createdAt: new Date('2026-03-19T17:00:00.000Z'),
        },
      ],
      threadActivities: [
        {
          activityId: 'activity-old',
          threadId: 'thread-1',
          executionId: 'exec-completed-old',
          activityKind: 'automation-dispatch',
          createdAt: new Date('2026-03-19T17:00:00.000Z'),
        },
      ],
    });

    expect(
      buildPiRuntimeMaintenancePlan({
        now,
        snapshot,
        retention: {
          completedExecutionMs: 24 * 60 * 60 * 1000,
          completedAutomationRunMs: 24 * 60 * 60 * 1000,
          executionEventMs: 12 * 60 * 60 * 1000,
          threadActivityMs: 12 * 60 * 60 * 1000,
        },
      }),
    ).toEqual({
      recovery: {
        automationIdsToResume: ['automation-due'],
        executionIdsToResume: ['exec-queued'],
        outboxIdsToReplay: ['outbox-due'],
        interruptIdsToResurface: ['interrupt-1'],
      },
      archival: {
        executionIds: ['exec-completed-old'],
        automationRunIds: ['run-completed-old'],
        executionEventIds: ['event-old'],
        threadActivityIds: ['activity-old'],
      },
    });
  });
});
