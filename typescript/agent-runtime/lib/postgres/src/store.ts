import { Client } from 'pg';

import { buildPersistDirectExecutionStatements, type PostgresStatement } from './transactions.js';
import type {
  PiAutomationRecord,
  PiAutomationRunRecord,
  PiExecutionEventRecord,
  PiExecutionRecord,
  PiThreadActivityRecord,
  PiThreadRecord,
} from './operatorControl.js';
import type { PiOutboxRecoveryRecord } from './outbox.js';
import type { PiRestartInterruptRecord } from './recovery.js';
import type { PiSchedulerLeaseRecord } from './schedulerLease.js';

type QueryRows = (sql: string) => Promise<readonly Record<string, unknown>[]>;

export type LoadPiRuntimeInspectionStateOptions = {
  databaseUrl: string;
  queryRows?: QueryRows;
};

export type ExecutePostgresStatements = (
  databaseUrl: string,
  statements: readonly PostgresStatement[],
) => Promise<void>;

export type LoadedPiRuntimeInspectionState = {
  threads: readonly PiThreadRecord[];
  executions: readonly PiExecutionRecord[];
  automations: readonly PiAutomationRecord[];
  automationRuns: readonly PiAutomationRunRecord[];
  interrupts: readonly PiRestartInterruptRecord[];
  leases: readonly PiSchedulerLeaseRecord[];
  outboxIntents: readonly PiOutboxRecoveryRecord[];
  executionEvents: readonly PiExecutionEventRecord[];
  threadActivities: readonly PiThreadActivityRecord[];
};

export type PersistPiRuntimeDirectExecutionOptions = {
  databaseUrl: string;
  threadId: string;
  threadKey: string;
  threadState: Record<string, unknown>;
  executionId: string;
  interruptId: string;
  artifactId: string;
  activityId: string;
  now: Date;
  executeStatements?: ExecutePostgresStatements;
};

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${fieldName} to be a string.`);
  }
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  return asString(value, 'nullable string');
}

function asBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected ${fieldName} to be a boolean.`);
  }
  return value;
}

function asDate(value: unknown, fieldName: string): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  throw new Error(`Expected ${fieldName} to be a valid date.`);
}

function asNullableDate(value: unknown, fieldName: string): Date | null {
  if (value == null) {
    return null;
  }
  return asDate(value, fieldName);
}

function asJsonObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error(`Expected ${fieldName} JSON to parse into an object.`);
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  throw new Error(`Expected ${fieldName} to be a JSON object.`);
}

async function loadRowsFromDatabase(databaseUrl: string, queries: readonly string[]): Promise<readonly (readonly Record<string, unknown>[])[]> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    const results: Array<readonly Record<string, unknown>[]> = [];
    for (const query of queries) {
      const result = await client.query<Record<string, unknown>>(query);
      results.push(result.rows);
    }
    return results;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export const executePostgresStatements: ExecutePostgresStatements = async (databaseUrl, statements) => {
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();
    for (const statement of statements) {
      await client.query(statement.text, [...statement.values]);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
};

export async function loadPiRuntimeInspectionState(
  options: LoadPiRuntimeInspectionStateOptions,
): Promise<LoadedPiRuntimeInspectionState> {
  const queries = [
    'select id, thread_key, status, thread_state, created_at, updated_at from pi_threads',
    'select id, thread_id, automation_run_id, status, source, current_interrupt_id, created_at, updated_at, completed_at from pi_executions',
    'select id, thread_id, command_name, cadence, schedule_payload, suspended, next_run_at, created_at, updated_at from pi_automations',
    'select id, automation_id, thread_id, execution_id, status, scheduled_at, started_at, completed_at from pi_automation_runs',
    'select id, thread_id, execution_id, status, surfaced_in_thread from pi_interrupts',
    'select automation_id, owner_id, lease_expires_at, last_heartbeat_at from pi_scheduler_leases',
    'select id, status, available_at, delivered_at from pi_outbox',
    'select id, execution_id, thread_id, event_kind, created_at from pi_execution_events',
    'select id, thread_id, execution_id, activity_kind, created_at from pi_thread_activity',
  ] as const;

  const rowsByQuery = options.queryRows
    ? await Promise.all(queries.map((query) => options.queryRows!(query)))
    : await loadRowsFromDatabase(options.databaseUrl, queries);

  const [
    threadRows,
    executionRows,
    automationRows,
    automationRunRows,
    interruptRows,
    leaseRows,
    outboxRows,
    executionEventRows,
    threadActivityRows,
  ] = rowsByQuery;

  return {
    threads: threadRows.map((row) => ({
      threadId: asString(row.id, 'pi_threads.id'),
      threadKey: asString(row.thread_key, 'pi_threads.thread_key'),
      status: asString(row.status, 'pi_threads.status'),
      threadState: asJsonObject(row.thread_state, 'pi_threads.thread_state'),
      createdAt: asDate(row.created_at, 'pi_threads.created_at'),
      updatedAt: asDate(row.updated_at, 'pi_threads.updated_at'),
    })),
    executions: executionRows.map((row) => ({
      executionId: asString(row.id, 'pi_executions.id'),
      threadId: asString(row.thread_id, 'pi_executions.thread_id'),
      automationRunId: asNullableString(row.automation_run_id),
      status: asString(row.status, 'pi_executions.status') as PiExecutionRecord['status'],
      source: asString(row.source, 'pi_executions.source') as PiExecutionRecord['source'],
      currentInterruptId: asNullableString(row.current_interrupt_id),
      createdAt: asDate(row.created_at, 'pi_executions.created_at'),
      updatedAt: asDate(row.updated_at, 'pi_executions.updated_at'),
      completedAt: asNullableDate(row.completed_at, 'pi_executions.completed_at'),
    })),
    automations: automationRows.map((row) => ({
      automationId: asString(row.id, 'pi_automations.id'),
      threadId: asString(row.thread_id, 'pi_automations.thread_id'),
      commandName: asString(row.command_name, 'pi_automations.command_name'),
      cadence: asString(row.cadence, 'pi_automations.cadence'),
      schedulePayload: asJsonObject(row.schedule_payload, 'pi_automations.schedule_payload'),
      suspended: asBoolean(row.suspended, 'pi_automations.suspended'),
      nextRunAt: asNullableDate(row.next_run_at, 'pi_automations.next_run_at'),
      createdAt: asDate(row.created_at, 'pi_automations.created_at'),
      updatedAt: asDate(row.updated_at, 'pi_automations.updated_at'),
    })),
    automationRuns: automationRunRows.map((row) => ({
      runId: asString(row.id, 'pi_automation_runs.id'),
      automationId: asString(row.automation_id, 'pi_automation_runs.automation_id'),
      threadId: asString(row.thread_id, 'pi_automation_runs.thread_id'),
      executionId: asNullableString(row.execution_id),
      status: asString(row.status, 'pi_automation_runs.status') as PiAutomationRunRecord['status'],
      scheduledAt: asDate(row.scheduled_at, 'pi_automation_runs.scheduled_at'),
      startedAt: asNullableDate(row.started_at, 'pi_automation_runs.started_at'),
      completedAt: asNullableDate(row.completed_at, 'pi_automation_runs.completed_at'),
    })),
    interrupts: interruptRows.map((row) => ({
      interruptId: asString(row.id, 'pi_interrupts.id'),
      threadId: asString(row.thread_id, 'pi_interrupts.thread_id'),
      executionId: asString(row.execution_id, 'pi_interrupts.execution_id'),
      status: asString(row.status, 'pi_interrupts.status') as PiRestartInterruptRecord['status'],
      surfacedInThread: asBoolean(row.surfaced_in_thread, 'pi_interrupts.surfaced_in_thread'),
    })),
    leases: leaseRows.map((row) => ({
      automationId: asString(row.automation_id, 'pi_scheduler_leases.automation_id'),
      ownerId: asString(row.owner_id, 'pi_scheduler_leases.owner_id'),
      leaseExpiresAt: asDate(row.lease_expires_at, 'pi_scheduler_leases.lease_expires_at'),
      lastHeartbeatAt: asDate(row.last_heartbeat_at, 'pi_scheduler_leases.last_heartbeat_at'),
    })),
    outboxIntents: outboxRows.map((row) => ({
      outboxId: asString(row.id, 'pi_outbox.id'),
      status: asString(row.status, 'pi_outbox.status') as PiOutboxRecoveryRecord['status'],
      availableAt: asDate(row.available_at, 'pi_outbox.available_at'),
      deliveredAt: asNullableDate(row.delivered_at, 'pi_outbox.delivered_at'),
    })),
    executionEvents: executionEventRows.map((row) => ({
      eventId: asString(row.id, 'pi_execution_events.id'),
      executionId: asString(row.execution_id, 'pi_execution_events.execution_id'),
      threadId: asString(row.thread_id, 'pi_execution_events.thread_id'),
      eventKind: asString(row.event_kind, 'pi_execution_events.event_kind'),
      createdAt: asDate(row.created_at, 'pi_execution_events.created_at'),
    })),
    threadActivities: threadActivityRows.map((row) => ({
      activityId: asString(row.id, 'pi_thread_activity.id'),
      threadId: asString(row.thread_id, 'pi_thread_activity.thread_id'),
      executionId: asNullableString(row.execution_id),
      activityKind: asString(row.activity_kind, 'pi_thread_activity.activity_kind'),
      createdAt: asDate(row.created_at, 'pi_thread_activity.created_at'),
    })),
  };
}

export async function persistPiRuntimeDirectExecution(
  options: PersistPiRuntimeDirectExecutionOptions,
): Promise<void> {
  const statements = buildPersistDirectExecutionStatements({
    threadId: options.threadId,
    threadKey: options.threadKey,
    threadState: options.threadState,
    executionId: options.executionId,
    interruptId: options.interruptId,
    artifactId: options.artifactId,
    activityId: options.activityId,
    now: options.now,
  });

  await (options.executeStatements ?? executePostgresStatements)(options.databaseUrl, statements);
}
