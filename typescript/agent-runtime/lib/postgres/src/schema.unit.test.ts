import { describe, expect, it } from 'vitest';

import { buildCreatePiRuntimeSchemaSql, piRuntimeTableSchemas } from './index.js';

describe('schema', () => {
  it('defines canonical Postgres tables and unique indexes for Pi runtime durability', () => {
    expect(piRuntimeTableSchemas.map((table) => table.tableName)).toEqual([
      'pi_threads',
      'pi_executions',
      'pi_automations',
      'pi_automation_runs',
      'pi_interrupts',
      'pi_artifacts',
      'pi_scheduler_leases',
      'pi_outbox',
      'pi_action_fingerprints',
      'pi_execution_events',
      'pi_thread_activity',
    ]);

    const executionsTable = piRuntimeTableSchemas.find((table) => table.tableName === 'pi_executions');
    expect(executionsTable?.primaryKey).toEqual(['id']);
    expect(executionsTable?.columns.map((column) => column.name)).toEqual([
      'id',
      'thread_id',
      'automation_run_id',
      'status',
      'source',
      'current_interrupt_id',
      'created_at',
      'updated_at',
      'completed_at',
    ]);

    const sql = buildCreatePiRuntimeSchemaSql().join('\n');
    expect(sql).toContain('create table if not exists pi_threads');
    expect(sql).toContain('create table if not exists pi_outbox');
    expect(sql).toContain(
      'create unique index if not exists pi_scheduler_leases_automation_id_key on pi_scheduler_leases (automation_id)',
    );
    expect(sql).toContain(
      'create unique index if not exists pi_action_fingerprints_wallet_fingerprint_key on pi_action_fingerprints (wallet_address, action_fingerprint)',
    );
  });
});
