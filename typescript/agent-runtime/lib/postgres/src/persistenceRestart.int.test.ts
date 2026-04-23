import { describe, expect, it } from 'vitest';

import {
  buildCreatePiRuntimeSchemaSql,
  buildPersistAutomationDispatchStatements,
  buildPersistInterruptCheckpointStatements,
  buildPersistOutboxIntentStatements,
  buildRestartRecoveryPlan,
  createOutboxIntent,
  resolvePostgresBootstrapPlan,
  type PostgresStatement,
} from './index.js';

const findStatement = (statements: readonly PostgresStatement[], tableName: string): PostgresStatement => {
  const statement = statements.find((candidate) => candidate.tableName === tableName);
  if (!statement) {
    throw new Error(`Expected a statement for ${tableName}.`);
  }

  return statement;
};

const findStatementByPrefix = (
  statements: readonly PostgresStatement[],
  tableName: string,
  prefix: string,
): PostgresStatement => {
  const statement = statements.find(
    (candidate) => candidate.tableName === tableName && candidate.text.startsWith(prefix),
  );
  if (!statement) {
    throw new Error(`Expected a statement for ${tableName} starting with "${prefix}".`);
  }

  return statement;
};

describe('persistence + restart integration', () => {
  it('keeps queued execution, interrupt, outbox, and bootstrap recovery aligned with persisted Postgres records', () => {
    const now = new Date('2026-03-18T20:00:00.000Z');
    const schemaSql = buildCreatePiRuntimeSchemaSql().join('\n');
    const bootstrapPlan = resolvePostgresBootstrapPlan({});

    const automationStatements = buildPersistAutomationDispatchStatements({
      automationId: 'auto-1',
      runId: 'run-1',
      executionId: 'exec-queued',
      threadId: 'thread-1',
      commandName: 'sync',
      schedulePayload: { command: 'sync', minutes: 5 },
      activityId: 'activity-automation',
      leaseOwnerId: 'worker-a',
      now,
      nextRunAt: new Date('2026-03-18T19:59:00.000Z'),
      leaseExpiresAt: new Date('2026-03-18T19:59:30.000Z'),
    });
    const interruptStatements = buildPersistInterruptCheckpointStatements({
      executionId: 'exec-interrupted',
      interruptId: 'interrupt-1',
      artifactId: 'artifact-1',
      activityId: 'activity-interrupt',
      threadId: 'thread-1',
      now,
    });
    const outboxIntent = createOutboxIntent({
      outboxId: 'outbox-1',
      executionId: 'exec-queued',
      threadId: 'thread-1',
      walletAddress: '0xabc',
      actionKind: 'swap',
      intentPayload: {
        token: 'USDC',
        amount: '100',
      },
      availableAt: new Date('2026-03-18T19:59:00.000Z'),
      createdAt: now,
    });
    const outboxStatements = buildPersistOutboxIntentStatements({
      outboxId: outboxIntent.outboxId,
      executionId: outboxIntent.executionId,
      threadId: outboxIntent.threadId,
      walletAddress: outboxIntent.walletAddress,
      actionKind: outboxIntent.actionKind,
      actionFingerprint: outboxIntent.actionFingerprint,
      eventId: 'event-1',
      now,
      availableAt: outboxIntent.availableAt,
      intentPayload: outboxIntent.intentPayload,
    });

    const touchedTables = new Set(
      [...automationStatements, ...interruptStatements, ...outboxStatements].map((statement) => statement.tableName),
    );
    for (const tableName of touchedTables) {
      expect(schemaSql).toContain(`create table if not exists ${tableName}`);
    }

    const queuedExecutionStatement = findStatement(automationStatements, 'pi_executions');
    const automationStatement = findStatement(automationStatements, 'pi_automations');
    const leaseStatement = findStatement(automationStatements, 'pi_scheduler_leases');
    const interruptedExecutionStatement = findStatement(interruptStatements, 'pi_executions');
    const interruptStatement = findStatementByPrefix(
      interruptStatements,
      'pi_interrupts',
      'insert into pi_interrupts',
    );
    const outboxStatement = findStatement(outboxStatements, 'pi_outbox');

    expect(bootstrapPlan).toEqual({
      mode: 'local-docker',
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      startCommand:
        'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17',
    });

    expect(
      buildRestartRecoveryPlan({
        now,
        automations: [
          {
            automationId: automationStatement.values[0] as string,
            suspended: automationStatement.values[5] as boolean,
            nextRunAt: automationStatement.values[6] as Date,
          },
        ],
        leases: [
          {
            automationId: leaseStatement.values[0] as string,
            ownerId: leaseStatement.values[1] as string,
            leaseExpiresAt: leaseStatement.values[2] as Date,
            lastHeartbeatAt: leaseStatement.values[3] as Date,
          },
        ],
        executions: [
          {
            executionId: queuedExecutionStatement.values[0] as string,
            threadId: queuedExecutionStatement.values[1] as string,
            status: queuedExecutionStatement.values[3] as 'queued',
            currentInterruptId: null,
          },
          {
            executionId: interruptedExecutionStatement.values[0] as string,
            threadId: interruptedExecutionStatement.values[1] as string,
            status: interruptedExecutionStatement.values[3] as 'interrupted',
            currentInterruptId: interruptedExecutionStatement.values[5] as string,
          },
        ],
        outboxIntents: [
          {
            outboxId: outboxStatement.values[0] as string,
            status: outboxStatement.values[6] as 'pending',
            availableAt: outboxStatement.values[8] as Date,
            deliveredAt: null,
          },
        ],
        interrupts: [
          {
            interruptId: interruptStatement.values[0] as string,
            threadId: interruptStatement.values[1] as string,
            executionId: interruptStatement.values[2] as string,
            status: interruptStatement.values[4] as 'pending',
            mirroredToActivity: interruptStatement.values[5] as boolean,
          },
        ],
      }),
    ).toEqual({
      automationIdsToResume: ['auto-1'],
      executionIdsToResume: ['exec-queued'],
      outboxIdsToReplay: ['outbox-1'],
      interruptIdsToResurface: ['interrupt-1'],
    });
  });
});
