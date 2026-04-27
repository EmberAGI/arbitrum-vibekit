import { describe, expect, it } from 'vitest';

import {
  buildCancelAutomationStatements,
  buildCompleteAutomationExecutionStatements,
  buildPersistAutomationDispatchStatements,
  buildPersistDirectExecutionStatements,
  buildPersistExecutionCheckpointStatements,
  buildPersistInterruptCheckpointStatements,
  buildPersistOutboxIntentStatements,
} from './index.js';

describe('transactions', () => {
  it('builds the direct execution boundary across thread, execution, interrupt, artifact, and activity tables', () => {
    const statements = buildPersistDirectExecutionStatements({
      threadId: 'thread-1',
      threadKey: 'root-thread-1',
      threadState: { phase: 'active' },
      executionId: 'exec-1',
      artifactId: 'artifact-1',
      activityId: 'activity-1',
      now: new Date('2026-03-18T20:00:00.000Z'),
    });

    expect(statements.map((statement) => statement.tableName)).toEqual([
      'pi_threads',
      'pi_executions',
      'pi_interrupts',
      'pi_artifacts',
      'pi_thread_activity',
    ]);
    expect(statements[0]?.text).toContain('insert into pi_threads');
    expect(statements[0]?.text).toContain('on conflict (thread_key) do update');
    expect(statements[0]?.text).toContain('id = excluded.id');
    expect(statements[1]?.text).toContain('insert into pi_executions');
    expect(statements[1]?.text).toContain('on conflict (id) do update');
    expect(statements[2]?.text).toContain('update pi_interrupts');
    expect(statements[1]?.values).toEqual([
      'exec-1',
      'thread-1',
      null,
      'working',
      'user',
      null,
      new Date('2026-03-18T20:00:00.000Z'),
      new Date('2026-03-18T20:00:00.000Z'),
      null,
    ]);
  });

  it('builds execution checkpoint statements that resolve stale pending interrupts when no interrupt is active', () => {
    const statements = buildPersistExecutionCheckpointStatements({
      executionId: 'exec-1',
      threadId: 'thread-1',
      automationRunId: null,
      status: 'completed',
      source: 'user',
      currentInterruptId: null,
      now: new Date('2026-03-18T20:05:00.000Z'),
    });

    expect(statements.map((statement) => statement.tableName)).toEqual([
      'pi_executions',
      'pi_interrupts',
    ]);
    expect(statements[0]?.text).toContain('insert into pi_executions');
    expect(statements[0]?.values).toEqual([
      'exec-1',
      'thread-1',
      null,
      'completed',
      'user',
      null,
      new Date('2026-03-18T20:05:00.000Z'),
      new Date('2026-03-18T20:05:00.000Z'),
      new Date('2026-03-18T20:05:00.000Z'),
    ]);
    expect(statements[1]?.text).toContain("where execution_id = $3 and status = 'pending'");
    expect(statements[1]?.values).toEqual([
      'resolved',
      new Date('2026-03-18T20:05:00.000Z'),
      'exec-1',
    ]);
  });

  it('builds execution checkpoint statements that keep only the current interrupt pending', () => {
    const statements = buildPersistExecutionCheckpointStatements({
      executionId: 'exec-1',
      threadId: 'thread-1',
      automationRunId: null,
      status: 'interrupted',
      source: 'system',
      currentInterruptId: 'interrupt-current',
      interruptPayload: {
        type: 'operator-config-request',
        message: 'Need operator input.',
      },
      mirroredToActivity: true,
      now: new Date('2026-03-18T20:05:00.000Z'),
    });

    expect(statements.map((statement) => statement.tableName)).toEqual([
      'pi_executions',
      'pi_interrupts',
      'pi_interrupts',
    ]);
    expect(statements[1]?.text).toContain("id <> $4");
    expect(statements[2]?.text).toContain('insert into pi_interrupts');
    expect(statements[2]?.values).toEqual([
      'interrupt-current',
      'thread-1',
      'exec-1',
      'input-required',
      'pending',
      true,
      JSON.stringify({
        type: 'operator-config-request',
        message: 'Need operator input.',
      }),
      new Date('2026-03-18T20:05:00.000Z'),
    ]);
  });

  it('builds the automation dispatch boundary across automation, run, execution, lease, and activity tables', () => {
    const statements = buildPersistAutomationDispatchStatements({
      automationId: 'auto-1',
      runId: 'run-1',
      executionId: 'exec-1',
      threadId: 'thread-1',
      commandName: 'sync',
      schedulePayload: { command: 'sync', minutes: 5 },
      activityId: 'activity-1',
      leaseOwnerId: 'worker-a',
      now: new Date('2026-03-18T20:00:00.000Z'),
      nextRunAt: new Date('2026-03-18T20:05:00.000Z'),
      leaseExpiresAt: new Date('2026-03-18T20:00:30.000Z'),
    });

    expect(statements.map((statement) => statement.tableName)).toEqual([
      'pi_automations',
      'pi_automation_runs',
      'pi_executions',
      'pi_scheduler_leases',
      'pi_thread_activity',
    ]);
    expect(statements[3]?.text).toContain('insert into pi_scheduler_leases');
    expect(statements[3]?.text).toContain('on conflict (automation_id) do update');
    expect(statements[0]?.values).toEqual([
      'auto-1',
      'thread-1',
      'sync',
      'interval',
      JSON.stringify({ command: 'sync', minutes: 5 }),
      false,
      new Date('2026-03-18T20:05:00.000Z'),
      new Date('2026-03-18T20:00:00.000Z'),
      new Date('2026-03-18T20:00:00.000Z'),
    ]);
    expect(statements[1]?.values).toEqual([
      'run-1',
      'auto-1',
      'thread-1',
      'exec-1',
      'scheduled',
      new Date('2026-03-18T20:00:00.000Z'),
      null,
    ]);
  });

  it('builds the automation completion boundary across run, execution, automation, next-run, event, and activity tables', () => {
    const statements = buildCompleteAutomationExecutionStatements({
      automationId: 'auto-1',
      currentRunId: 'run-1',
      currentExecutionId: 'exec-1',
      nextRunId: 'run-2',
      nextExecutionId: 'exec-2',
      threadId: 'thread-1',
      commandName: 'sync',
      schedulePayload: { command: 'sync', minutes: 5 },
      eventId: 'event-1',
      activityId: 'activity-1',
      now: new Date('2026-03-18T20:05:00.000Z'),
      nextRunAt: new Date('2026-03-18T20:10:00.000Z'),
      leaseExpiresAt: new Date('2026-03-18T20:05:00.000Z'),
    });

    expect(statements.map((statement) => statement.tableName)).toEqual([
      'pi_automation_runs',
      'pi_executions',
      'pi_automations',
      'pi_automation_runs',
      'pi_executions',
      'pi_scheduler_leases',
      'pi_execution_events',
      'pi_thread_activity',
    ]);
    expect(statements[0]?.text).toContain('update pi_automation_runs');
    expect(statements[0]?.text).toContain('status = $1');
    expect(statements[1]?.text).toContain('update pi_executions');
    expect(statements[2]?.text).toContain('update pi_automations');
    expect(statements[3]?.text).toContain('insert into pi_automation_runs');
    expect(statements[4]?.text).toContain('insert into pi_executions');
    expect(statements[5]?.text).toContain('insert into pi_scheduler_leases');
    expect(statements[6]?.text).toContain('insert into pi_execution_events');
    expect(statements[7]?.text).toContain('insert into pi_thread_activity');
  });

  it('builds failed automation execution boundaries while still scheduling the next run', () => {
    const statements = buildCompleteAutomationExecutionStatements({
      automationId: 'auto-1',
      currentRunId: 'run-1',
      currentExecutionId: 'exec-1',
      nextRunId: 'run-2',
      nextExecutionId: 'exec-2',
      threadId: 'thread-1',
      commandName: 'sync',
      schedulePayload: { command: 'sync', minutes: 5 },
      eventId: 'event-1',
      activityId: 'activity-1',
      now: new Date('2026-03-18T20:05:00.000Z'),
      nextRunAt: new Date('2026-03-18T20:10:00.000Z'),
      leaseExpiresAt: new Date('2026-03-18T20:05:00.000Z'),
      status: 'failed',
    });

    expect(statements[0]?.values[0]).toBe('failed');
    expect(statements[1]?.values[0]).toBe('failed');
    expect(statements[3]?.values[4]).toBe('scheduled');
    expect(statements[6]?.values[3]).toBe('automation-failed');
    expect(statements[7]?.values[3]).toBe('automation-failed');
  });

  it('builds the automation cancellation boundary across automation, run, execution, lease, event, and activity tables', () => {
    const statements = buildCancelAutomationStatements({
      automationId: 'auto-1',
      currentRunId: 'run-1',
      currentExecutionId: 'exec-1',
      threadId: 'thread-1',
      eventId: 'event-1',
      activityId: 'activity-1',
      now: new Date('2026-03-18T20:05:00.000Z'),
    });

    expect(statements.map((statement) => statement.tableName)).toEqual([
      'pi_automations',
      'pi_automation_runs',
      'pi_executions',
      'pi_scheduler_leases',
      'pi_execution_events',
      'pi_thread_activity',
    ]);
    expect(statements[0]?.text).toContain('update pi_automations');
    expect(statements[0]?.text).toContain('suspended = $1');
    expect(statements[1]?.text).toContain('update pi_automation_runs');
    expect(statements[1]?.text).toContain("status = 'scheduled'");
    expect(statements[2]?.text).toContain('update pi_executions');
    expect(statements[3]?.text).toContain('delete from pi_scheduler_leases');
    expect(statements[4]?.text).toContain('insert into pi_execution_events');
    expect(statements[5]?.text).toContain('insert into pi_thread_activity');
  });

  it('builds interrupt checkpoint and outbox intent boundaries with the expected tables', () => {
    const interruptStatements = buildPersistInterruptCheckpointStatements({
      executionId: 'exec-1',
      interruptId: 'interrupt-1',
      artifactId: 'artifact-1',
      activityId: 'activity-1',
      threadId: 'thread-1',
      now: new Date('2026-03-18T20:00:00.000Z'),
    });
    expect(interruptStatements.map((statement) => statement.tableName)).toEqual([
      'pi_executions',
      'pi_interrupts',
      'pi_interrupts',
      'pi_artifacts',
      'pi_thread_activity',
    ]);

    const outboxStatements = buildPersistOutboxIntentStatements({
      outboxId: 'outbox-1',
      executionId: 'exec-1',
      threadId: 'thread-1',
      walletAddress: '0xabc',
      actionKind: 'swap',
      actionFingerprint: 'fingerprint-1',
      eventId: 'event-1',
      now: new Date('2026-03-18T20:00:00.000Z'),
      availableAt: new Date('2026-03-18T20:00:00.000Z'),
      intentPayload: { token: 'USDC', amount: '100' },
    });
    expect(outboxStatements.map((statement) => statement.tableName)).toEqual([
      'pi_outbox',
      'pi_action_fingerprints',
      'pi_execution_events',
    ]);
    expect(outboxStatements[1]?.text).toContain('on conflict (wallet_address, action_fingerprint) do update');
  });
});
