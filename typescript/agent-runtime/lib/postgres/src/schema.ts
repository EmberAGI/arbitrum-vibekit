import { piRuntimePersistenceModel } from '../../contracts/dist/index.js';

export type PiRuntimeColumnSchema = {
  name: string;
  type: 'uuid' | 'text' | 'jsonb' | 'timestamptz' | 'boolean';
  nullable?: boolean;
};

export type PiRuntimeTableIndex = {
  name: string;
  columns: readonly string[];
  unique?: boolean;
};

export type PiRuntimeTableSchema = {
  tableName: string;
  primaryKey: readonly string[];
  columns: readonly PiRuntimeColumnSchema[];
  indexes?: readonly PiRuntimeTableIndex[];
  uniqueIndexes?: readonly PiRuntimeTableIndex[];
};

export const piRuntimeTableSchemas: readonly PiRuntimeTableSchema[] = [
  {
    tableName: 'pi_threads',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'thread_key', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'thread_state', type: 'jsonb' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
    uniqueIndexes: [{ name: 'pi_threads_thread_key_key', columns: ['thread_key'], unique: true }],
  },
  {
    tableName: 'pi_executions',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'thread_id', type: 'uuid' },
      { name: 'automation_run_id', type: 'uuid', nullable: true },
      { name: 'status', type: 'text' },
      { name: 'source', type: 'text' },
      { name: 'current_interrupt_id', type: 'uuid', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
      { name: 'completed_at', type: 'timestamptz', nullable: true },
    ],
    indexes: [{ name: 'pi_executions_thread_id_idx', columns: ['thread_id'] }],
  },
  {
    tableName: 'pi_automations',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'thread_id', type: 'uuid' },
      { name: 'command_name', type: 'text' },
      { name: 'cadence', type: 'text' },
      { name: 'schedule_payload', type: 'jsonb' },
      { name: 'suspended', type: 'boolean' },
      { name: 'next_run_at', type: 'timestamptz', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
  {
    tableName: 'pi_automation_runs',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'automation_id', type: 'uuid' },
      { name: 'thread_id', type: 'uuid' },
      { name: 'execution_id', type: 'uuid', nullable: true },
      { name: 'status', type: 'text' },
      { name: 'scheduled_at', type: 'timestamptz' },
      { name: 'started_at', type: 'timestamptz', nullable: true },
      { name: 'completed_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    tableName: 'pi_interrupts',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'thread_id', type: 'uuid' },
      { name: 'execution_id', type: 'uuid' },
      { name: 'interrupt_type', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'surfaced_in_thread', type: 'boolean' },
      { name: 'request_payload', type: 'jsonb' },
      { name: 'response_payload', type: 'jsonb', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'resolved_at', type: 'timestamptz', nullable: true },
    ],
  },
  {
    tableName: 'pi_artifacts',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'thread_id', type: 'uuid' },
      { name: 'execution_id', type: 'uuid', nullable: true },
      { name: 'artifact_kind', type: 'text' },
      { name: 'append_only', type: 'boolean' },
      { name: 'payload', type: 'jsonb' },
      { name: 'created_at', type: 'timestamptz' },
      { name: 'updated_at', type: 'timestamptz' },
    ],
  },
  {
    tableName: 'pi_scheduler_leases',
    primaryKey: ['automation_id'],
    columns: [
      { name: 'automation_id', type: 'uuid' },
      { name: 'owner_id', type: 'text' },
      { name: 'lease_expires_at', type: 'timestamptz' },
      { name: 'last_heartbeat_at', type: 'timestamptz' },
    ],
    uniqueIndexes: [
      { name: 'pi_scheduler_leases_automation_id_key', columns: ['automation_id'], unique: true },
    ],
  },
  {
    tableName: 'pi_outbox',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'execution_id', type: 'uuid' },
      { name: 'thread_id', type: 'uuid' },
      { name: 'wallet_address', type: 'text' },
      { name: 'action_kind', type: 'text' },
      { name: 'action_fingerprint', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'intent_payload', type: 'jsonb' },
      { name: 'available_at', type: 'timestamptz' },
      { name: 'delivered_at', type: 'timestamptz', nullable: true },
      { name: 'created_at', type: 'timestamptz' },
    ],
    indexes: [{ name: 'pi_outbox_available_at_idx', columns: ['available_at'] }],
  },
  {
    tableName: 'pi_action_fingerprints',
    primaryKey: ['wallet_address', 'action_fingerprint'],
    columns: [
      { name: 'wallet_address', type: 'text' },
      { name: 'action_kind', type: 'text' },
      { name: 'action_fingerprint', type: 'text' },
      { name: 'first_execution_id', type: 'uuid' },
      { name: 'first_seen_at', type: 'timestamptz' },
      { name: 'last_seen_at', type: 'timestamptz' },
    ],
    uniqueIndexes: [
      {
        name: 'pi_action_fingerprints_wallet_fingerprint_key',
        columns: ['wallet_address', 'action_fingerprint'],
        unique: true,
      },
    ],
  },
  {
    tableName: 'pi_execution_events',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'execution_id', type: 'uuid' },
      { name: 'thread_id', type: 'uuid' },
      { name: 'event_kind', type: 'text' },
      { name: 'payload', type: 'jsonb' },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
  {
    tableName: 'pi_thread_activity',
    primaryKey: ['id'],
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'thread_id', type: 'uuid' },
      { name: 'execution_id', type: 'uuid', nullable: true },
      { name: 'activity_kind', type: 'text' },
      { name: 'payload', type: 'jsonb' },
      { name: 'created_at', type: 'timestamptz' },
    ],
  },
];

const canonicalTableNames = new Set<string>([
  ...piRuntimePersistenceModel.currentStateTables.map(({ tableName }) => tableName),
  ...piRuntimePersistenceModel.supportingTables.map(({ tableName }) => tableName),
  ...piRuntimePersistenceModel.historyTables.map(({ tableName }) => tableName),
]);

for (const table of piRuntimeTableSchemas) {
  canonicalTableNames.delete(table.tableName);
}

if (canonicalTableNames.size > 0) {
  throw new Error(
    `Missing Postgres schema definitions for: ${Array.from(canonicalTableNames).join(', ')}`,
  );
}

const renderColumn = (column: PiRuntimeColumnSchema): string => {
  const nullableSuffix = column.nullable ? '' : ' not null';
  return `${column.name} ${column.type}${nullableSuffix}`;
};

export function buildCreatePiRuntimeSchemaSql(): string[] {
  const statements: string[] = [];

  for (const table of piRuntimeTableSchemas) {
    const columnSql = table.columns.map(renderColumn).join(', ');
    const primaryKeySql = `primary key (${table.primaryKey.join(', ')})`;
    statements.push(
      `create table if not exists ${table.tableName} (${columnSql}, ${primaryKeySql});`,
    );

    for (const index of table.uniqueIndexes ?? []) {
      statements.push(
        `create unique index if not exists ${index.name} on ${table.tableName} (${index.columns.join(', ')});`,
      );
    }

    for (const index of table.indexes ?? []) {
      statements.push(
        `create index if not exists ${index.name} on ${table.tableName} (${index.columns.join(', ')});`,
      );
    }
  }

  return statements;
}
