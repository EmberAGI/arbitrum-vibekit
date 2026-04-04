import { describe, expect, it, vi } from 'vitest';

import { loadPiRuntimeInspectionState, persistPiRuntimeDirectExecution } from './index.js';

describe('loadPiRuntimeInspectionState', () => {
  it('loads canonical runtime inspection records from Postgres rows', async () => {
    const queryRows = vi.fn(async (sql: string) => {
      if (sql.includes('from pi_threads')) {
        return [
          {
            id: 'thread-1',
            thread_key: 'thread-1',
            status: 'active',
            thread_state: { threadId: 'thread-1' },
            created_at: '2026-03-20T00:00:00.000Z',
            updated_at: '2026-03-20T00:01:00.000Z',
          },
        ];
      }

      if (sql.includes('from pi_executions')) {
        return [
          {
            id: 'exec-1',
            thread_id: 'thread-1',
            automation_run_id: null,
            status: 'working',
            source: 'user',
            current_interrupt_id: 'interrupt-1',
            created_at: '2026-03-20T00:02:00.000Z',
            updated_at: '2026-03-20T00:03:00.000Z',
            completed_at: null,
          },
        ];
      }

      if (sql.includes('from pi_automations')) {
        return [
          {
            id: 'automation-1',
            thread_id: 'thread-1',
            command_name: 'sync',
            cadence: '0 * * * *',
            schedule_payload: { command: 'sync' },
            suspended: false,
            next_run_at: '2026-03-20T01:00:00.000Z',
            created_at: '2026-03-20T00:00:00.000Z',
            updated_at: '2026-03-20T00:04:00.000Z',
          },
        ];
      }

      if (sql.includes('from pi_automation_runs')) {
        return [
          {
            id: 'run-1',
            automation_id: 'automation-1',
            thread_id: 'thread-1',
            execution_id: 'exec-1',
            status: 'scheduled',
            scheduled_at: '2026-03-20T00:05:00.000Z',
            started_at: null,
            completed_at: null,
          },
        ];
      }

      if (sql.includes('from pi_interrupts')) {
        return [
          {
            id: 'interrupt-1',
            thread_id: 'thread-1',
            execution_id: 'exec-1',
            status: 'pending',
            surfaced_in_thread: true,
          },
        ];
      }

      if (sql.includes('from pi_scheduler_leases')) {
        return [
          {
            automation_id: 'automation-1',
            owner_id: 'worker-a',
            lease_expires_at: '2026-03-20T00:06:00.000Z',
            last_heartbeat_at: '2026-03-20T00:05:30.000Z',
          },
        ];
      }

      if (sql.includes('from pi_outbox')) {
        return [
          {
            id: 'outbox-1',
            status: 'pending',
            available_at: '2026-03-20T00:07:00.000Z',
            delivered_at: null,
          },
        ];
      }

      if (sql.includes('from pi_execution_events')) {
        return [
          {
            id: 'event-1',
            execution_id: 'exec-1',
            thread_id: 'thread-1',
            event_kind: 'outbox-intent',
            created_at: '2026-03-20T00:08:00.000Z',
          },
        ];
      }

      if (sql.includes('from pi_thread_activity')) {
        return [
          {
            id: 'activity-1',
            thread_id: 'thread-1',
            execution_id: 'exec-1',
            activity_kind: 'direct-execution',
            created_at: '2026-03-20T00:09:00.000Z',
          },
        ];
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(
      loadPiRuntimeInspectionState({
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
        queryRows,
      }),
    ).resolves.toEqual({
      threads: [
        {
          threadId: 'thread-1',
          threadKey: 'thread-1',
          status: 'active',
          threadState: { threadId: 'thread-1' },
          createdAt: new Date('2026-03-20T00:00:00.000Z'),
          updatedAt: new Date('2026-03-20T00:01:00.000Z'),
        },
      ],
      executions: [
        {
          executionId: 'exec-1',
          threadId: 'thread-1',
          automationRunId: null,
          status: 'working',
          source: 'user',
          currentInterruptId: 'interrupt-1',
          createdAt: new Date('2026-03-20T00:02:00.000Z'),
          updatedAt: new Date('2026-03-20T00:03:00.000Z'),
          completedAt: null,
        },
      ],
      automations: [
        {
          automationId: 'automation-1',
          threadId: 'thread-1',
          commandName: 'sync',
          cadence: '0 * * * *',
          schedulePayload: { command: 'sync' },
          suspended: false,
          nextRunAt: new Date('2026-03-20T01:00:00.000Z'),
          createdAt: new Date('2026-03-20T00:00:00.000Z'),
          updatedAt: new Date('2026-03-20T00:04:00.000Z'),
        },
      ],
      automationRuns: [
        {
          runId: 'run-1',
          automationId: 'automation-1',
          threadId: 'thread-1',
          executionId: 'exec-1',
          status: 'scheduled',
          scheduledAt: new Date('2026-03-20T00:05:00.000Z'),
          startedAt: null,
          completedAt: null,
        },
      ],
      interrupts: [
        {
          interruptId: 'interrupt-1',
          threadId: 'thread-1',
          executionId: 'exec-1',
          status: 'pending',
          surfacedInThread: true,
        },
      ],
      leases: [
        {
          automationId: 'automation-1',
          ownerId: 'worker-a',
          leaseExpiresAt: new Date('2026-03-20T00:06:00.000Z'),
          lastHeartbeatAt: new Date('2026-03-20T00:05:30.000Z'),
        },
      ],
      outboxIntents: [
        {
          outboxId: 'outbox-1',
          status: 'pending',
          availableAt: new Date('2026-03-20T00:07:00.000Z'),
          deliveredAt: null,
        },
      ],
      executionEvents: [
        {
          eventId: 'event-1',
          executionId: 'exec-1',
          threadId: 'thread-1',
          eventKind: 'outbox-intent',
          createdAt: new Date('2026-03-20T00:08:00.000Z'),
        },
      ],
      threadActivities: [
        {
          activityId: 'activity-1',
          threadId: 'thread-1',
          executionId: 'exec-1',
          activityKind: 'direct-execution',
          createdAt: new Date('2026-03-20T00:09:00.000Z'),
        },
      ],
    });
  });
});

describe('persistPiRuntimeDirectExecution', () => {
  it('writes the canonical direct-execution checkpoint statements through the shared execution hook', async () => {
    const executeStatements = vi.fn(async () => undefined);
    const now = new Date('2026-03-20T00:10:00.000Z');

    await persistPiRuntimeDirectExecution({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      threadId: 'thread-1',
      threadKey: 'thread-1',
      threadState: { threadId: 'thread-1' },
      executionId: 'pi-example:thread-1',
      artifactId: 'artifact-1',
      activityId: 'activity-1',
      now,
      executeStatements,
    });

    expect(executeStatements).toHaveBeenCalledTimes(1);
    expect(executeStatements).toHaveBeenCalledWith(
      'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      expect.arrayContaining([
        expect.objectContaining({ tableName: 'pi_threads' }),
        expect.objectContaining({ tableName: 'pi_executions' }),
        expect.objectContaining({ tableName: 'pi_artifacts' }),
        expect.objectContaining({ tableName: 'pi_thread_activity' }),
      ]),
    );
  });
});
