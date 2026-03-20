export type PostgresStatement = {
  tableName: string;
  text: string;
  values: readonly unknown[];
};

const buildStatement = (
  tableName: string,
  text: string,
  values: readonly unknown[],
): PostgresStatement => ({
  tableName,
  text,
  values,
});

export function buildPersistDirectExecutionStatements(params: {
  threadId: string;
  threadKey: string;
  threadState: Record<string, unknown>;
  executionId: string;
  interruptId: string;
  artifactId: string;
  activityId: string;
  now: Date;
}): PostgresStatement[] {
  return [
    buildStatement(
      'pi_threads',
      'insert into pi_threads (id, thread_key, status, thread_state, created_at, updated_at) values ($1, $2, $3, $4, $5, $6) on conflict (id) do update set thread_state = excluded.thread_state, updated_at = excluded.updated_at',
      [params.threadId, params.threadKey, 'active', JSON.stringify(params.threadState), params.now, params.now],
    ),
    buildStatement(
      'pi_executions',
      'insert into pi_executions (id, thread_id, automation_run_id, status, source, current_interrupt_id, created_at, updated_at, completed_at) values ($1, $2, null, $3, $4, $5, $6, $7, null) on conflict (id) do update set status = excluded.status, current_interrupt_id = excluded.current_interrupt_id, updated_at = excluded.updated_at',
      [params.executionId, params.threadId, 'working', 'user', params.interruptId, params.now, params.now],
    ),
    buildStatement(
      'pi_interrupts',
      'insert into pi_interrupts (id, thread_id, execution_id, interrupt_type, status, surfaced_in_thread, request_payload, response_payload, created_at, resolved_at) values ($1, $2, $3, $4, $5, $6, $7, null, $8, null) on conflict (id) do update set status = excluded.status, request_payload = excluded.request_payload',
      [params.interruptId, params.threadId, params.executionId, 'input-required', 'pending', true, '{}', params.now],
    ),
    buildStatement(
      'pi_artifacts',
      'insert into pi_artifacts (id, thread_id, execution_id, artifact_kind, append_only, payload, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at',
      [params.artifactId, params.threadId, params.executionId, 'current', false, '{}', params.now, params.now],
    ),
    buildStatement(
      'pi_thread_activity',
      'insert into pi_thread_activity (id, thread_id, execution_id, activity_kind, payload, created_at) values ($1, $2, $3, $4, $5, $6)',
      [params.activityId, params.threadId, params.executionId, 'direct-execution', '{}', params.now],
    ),
  ];
}

export function buildPersistAutomationDispatchStatements(params: {
  automationId: string;
  runId: string;
  executionId: string;
  threadId: string;
  activityId: string;
  leaseOwnerId: string;
  now: Date;
  nextRunAt: Date;
  leaseExpiresAt: Date;
}): PostgresStatement[] {
  return [
    buildStatement(
      'pi_automations',
      'insert into pi_automations (id, thread_id, command_name, cadence, schedule_payload, suspended, next_run_at, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do update set next_run_at = excluded.next_run_at, updated_at = excluded.updated_at',
      [params.automationId, params.threadId, 'sync', 'interval', '{}', false, params.nextRunAt, params.now, params.now],
    ),
    buildStatement(
      'pi_automation_runs',
      'insert into pi_automation_runs (id, automation_id, thread_id, execution_id, status, scheduled_at, started_at, completed_at) values ($1, $2, $3, $4, $5, $6, $7, null)',
      [params.runId, params.automationId, params.threadId, params.executionId, 'scheduled', params.now, params.now],
    ),
    buildStatement(
      'pi_executions',
      'insert into pi_executions (id, thread_id, automation_run_id, status, source, current_interrupt_id, created_at, updated_at, completed_at) values ($1, $2, $3, $4, $5, null, $6, $7, null) on conflict (id) do update set status = excluded.status, updated_at = excluded.updated_at',
      [params.executionId, params.threadId, params.runId, 'queued', 'automation', params.now, params.now],
    ),
    buildStatement(
      'pi_scheduler_leases',
      'insert into pi_scheduler_leases (automation_id, owner_id, lease_expires_at, last_heartbeat_at) values ($1, $2, $3, $4) on conflict (automation_id) do update set owner_id = excluded.owner_id, lease_expires_at = excluded.lease_expires_at, last_heartbeat_at = excluded.last_heartbeat_at',
      [params.automationId, params.leaseOwnerId, params.leaseExpiresAt, params.now],
    ),
    buildStatement(
      'pi_thread_activity',
      'insert into pi_thread_activity (id, thread_id, execution_id, activity_kind, payload, created_at) values ($1, $2, $3, $4, $5, $6)',
      [params.activityId, params.threadId, params.executionId, 'automation-dispatch', '{}', params.now],
    ),
  ];
}

export function buildPersistInterruptCheckpointStatements(params: {
  executionId: string;
  interruptId: string;
  artifactId: string;
  activityId: string;
  threadId: string;
  now: Date;
}): PostgresStatement[] {
  return [
    buildStatement(
      'pi_executions',
      'insert into pi_executions (id, thread_id, automation_run_id, status, source, current_interrupt_id, created_at, updated_at, completed_at) values ($1, $2, null, $3, $4, $5, $6, $7, null) on conflict (id) do update set current_interrupt_id = excluded.current_interrupt_id, updated_at = excluded.updated_at',
      [params.executionId, params.threadId, 'interrupted', 'system', params.interruptId, params.now, params.now],
    ),
    buildStatement(
      'pi_interrupts',
      'insert into pi_interrupts (id, thread_id, execution_id, interrupt_type, status, surfaced_in_thread, request_payload, response_payload, created_at, resolved_at) values ($1, $2, $3, $4, $5, $6, $7, null, $8, null) on conflict (id) do update set status = excluded.status, request_payload = excluded.request_payload',
      [params.interruptId, params.threadId, params.executionId, 'input-required', 'pending', true, '{}', params.now],
    ),
    buildStatement(
      'pi_artifacts',
      'insert into pi_artifacts (id, thread_id, execution_id, artifact_kind, append_only, payload, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do update set payload = excluded.payload, updated_at = excluded.updated_at',
      [params.artifactId, params.threadId, params.executionId, 'current', false, '{}', params.now, params.now],
    ),
    buildStatement(
      'pi_thread_activity',
      'insert into pi_thread_activity (id, thread_id, execution_id, activity_kind, payload, created_at) values ($1, $2, $3, $4, $5, $6)',
      [params.activityId, params.threadId, params.executionId, 'interrupt-checkpoint', '{}', params.now],
    ),
  ];
}

export function buildPersistOutboxIntentStatements(params: {
  outboxId: string;
  executionId: string;
  threadId: string;
  walletAddress: string;
  actionKind: string;
  actionFingerprint: string;
  eventId: string;
  now: Date;
  availableAt: Date;
  intentPayload: Record<string, unknown>;
}): PostgresStatement[] {
  return [
    buildStatement(
      'pi_outbox',
      'insert into pi_outbox (id, execution_id, thread_id, wallet_address, action_kind, action_fingerprint, status, intent_payload, available_at, delivered_at, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, $10)',
      [
        params.outboxId,
        params.executionId,
        params.threadId,
        params.walletAddress,
        params.actionKind,
        params.actionFingerprint,
        'pending',
        JSON.stringify(params.intentPayload),
        params.availableAt,
        params.now,
      ],
    ),
    buildStatement(
      'pi_action_fingerprints',
      'insert into pi_action_fingerprints (wallet_address, action_kind, action_fingerprint, first_execution_id, first_seen_at, last_seen_at) values ($1, $2, $3, $4, $5, $6) on conflict (wallet_address, action_fingerprint) do update set last_seen_at = excluded.last_seen_at',
      [
        params.walletAddress,
        params.actionKind,
        params.actionFingerprint,
        params.executionId,
        params.now,
        params.now,
      ],
    ),
    buildStatement(
      'pi_execution_events',
      'insert into pi_execution_events (id, execution_id, thread_id, event_kind, payload, created_at) values ($1, $2, $3, $4, $5, $6)',
      [params.eventId, params.executionId, params.threadId, 'outbox-intent', JSON.stringify(params.intentPayload), params.now],
    ),
  ];
}
