import { describe, expect, it } from 'vitest';

import {
  buildPersistAutomationDispatchStatements,
  buildPersistDirectExecutionStatements,
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
      interruptId: 'interrupt-1',
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
    expect(statements[1]?.text).toContain('insert into pi_executions');
    expect(statements[1]?.text).toContain('on conflict (id) do update');
  });

  it('builds the automation dispatch boundary across automation, run, execution, lease, and activity tables', () => {
    const statements = buildPersistAutomationDispatchStatements({
      automationId: 'auto-1',
      runId: 'run-1',
      executionId: 'exec-1',
      threadId: 'thread-1',
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
