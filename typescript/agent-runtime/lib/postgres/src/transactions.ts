export type PostgresStatement = {
  tableName: string;
  text: string;
  values: readonly unknown[];
};

export type PiExecutionCheckpointStatus =
  | 'queued'
  | 'working'
  | 'interrupted'
  | 'completed'
  | 'failed';

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
  artifactId: string;
  activityId: string;
  now: Date;
}): PostgresStatement[] {
  return [
    ...buildPersistThreadStateStatements({
      threadId: params.threadId,
      threadKey: params.threadKey,
      threadState: params.threadState,
      now: params.now,
    }),
    ...buildPersistExecutionCheckpointStatements({
      executionId: params.executionId,
      threadId: params.threadId,
      automationRunId: null,
      status: 'working',
      source: 'user',
      currentInterruptId: null,
      now: params.now,
    }),
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

export function buildPersistExecutionCheckpointStatements(params: {
  executionId: string;
  threadId: string;
  automationRunId?: string | null;
  status: PiExecutionCheckpointStatus;
  source: 'user' | 'automation' | 'system';
  currentInterruptId: string | null;
  interruptType?: string;
  interruptPayload?: Record<string, unknown>;
  mirroredToActivity?: boolean;
  now: Date;
}): PostgresStatement[] {
  const completedAt =
    params.status === 'completed' || params.status === 'failed'
      ? params.now
      : null;
  const statements: PostgresStatement[] = [
    buildStatement(
      'pi_executions',
      'insert into pi_executions (id, thread_id, automation_run_id, status, source, current_interrupt_id, created_at, updated_at, completed_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do update set automation_run_id = coalesce(excluded.automation_run_id, pi_executions.automation_run_id), status = excluded.status, source = excluded.source, current_interrupt_id = excluded.current_interrupt_id, updated_at = excluded.updated_at, completed_at = excluded.completed_at',
      [
        params.executionId,
        params.threadId,
        params.automationRunId ?? null,
        params.status,
        params.source,
        params.currentInterruptId,
        params.now,
        params.now,
        completedAt,
      ],
    ),
  ];

  if (params.currentInterruptId === null) {
    statements.push(
      buildStatement(
        'pi_interrupts',
        "update pi_interrupts set status = $1, resolved_at = coalesce(resolved_at, $2), response_payload = coalesce(response_payload, '{}'::jsonb) where execution_id = $3 and status = 'pending'",
        ['resolved', params.now, params.executionId],
      ),
    );
    return statements;
  }

  statements.push(
    buildStatement(
      'pi_interrupts',
      "update pi_interrupts set status = $1, resolved_at = coalesce(resolved_at, $2), response_payload = coalesce(response_payload, '{}'::jsonb) where execution_id = $3 and status = 'pending' and id <> $4",
      ['resolved', params.now, params.executionId, params.currentInterruptId],
    ),
    buildStatement(
      'pi_interrupts',
      'insert into pi_interrupts (id, thread_id, execution_id, interrupt_type, status, mirrored_to_activity, request_payload, response_payload, created_at, resolved_at) values ($1, $2, $3, $4, $5, $6, $7, null, $8, null) on conflict (id) do update set thread_id = excluded.thread_id, execution_id = excluded.execution_id, interrupt_type = excluded.interrupt_type, status = excluded.status, mirrored_to_activity = excluded.mirrored_to_activity, request_payload = excluded.request_payload, response_payload = null, resolved_at = null',
      [
        params.currentInterruptId,
        params.threadId,
        params.executionId,
        params.interruptType ?? 'input-required',
        'pending',
        params.mirroredToActivity ?? true,
        JSON.stringify(params.interruptPayload ?? {}),
        params.now,
      ],
    ),
  );

  return statements;
}

export function buildPersistThreadStateStatements(params: {
  threadId: string;
  threadKey: string;
  threadState: Record<string, unknown>;
  now: Date;
}): PostgresStatement[] {
  return [
    buildStatement(
      'pi_threads',
      'insert into pi_threads (id, thread_key, status, thread_state, created_at, updated_at) values ($1, $2, $3, $4, $5, $6) on conflict (thread_key) do update set id = excluded.id, status = excluded.status, thread_state = excluded.thread_state, updated_at = excluded.updated_at',
      [params.threadId, params.threadKey, 'active', JSON.stringify(params.threadState), params.now, params.now],
    ),
  ];
}

export function buildPersistAutomationDispatchStatements(params: {
  automationId: string;
  runId: string;
  executionId: string;
  threadId: string;
  commandName: string;
  schedulePayload: Record<string, unknown>;
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
      [
        params.automationId,
        params.threadId,
        params.commandName,
        'interval',
        JSON.stringify(params.schedulePayload),
        false,
        params.nextRunAt,
        params.now,
        params.now,
      ],
    ),
    buildStatement(
      'pi_automation_runs',
      'insert into pi_automation_runs (id, automation_id, thread_id, execution_id, status, scheduled_at, started_at, completed_at) values ($1, $2, $3, $4, $5, $6, $7, null)',
      [params.runId, params.automationId, params.threadId, params.executionId, 'scheduled', params.now, null],
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

export function buildCompleteAutomationExecutionStatements(params: {
  automationId: string;
  currentRunId: string;
  currentExecutionId: string;
  nextRunId: string;
  nextExecutionId: string;
  threadId: string;
  commandName: string;
  schedulePayload: Record<string, unknown>;
  eventId: string;
  activityId: string;
  now: Date;
  nextRunAt: Date;
  leaseExpiresAt: Date;
}): PostgresStatement[] {
  return [
    buildStatement(
      'pi_automation_runs',
      'update pi_automation_runs set status = $1, started_at = coalesce(started_at, $2), completed_at = $3 where id = $4',
      ['completed', params.now, params.now, params.currentRunId],
    ),
    buildStatement(
      'pi_executions',
      'update pi_executions set status = $1, updated_at = $2, completed_at = $3 where id = $4',
      ['completed', params.now, params.now, params.currentExecutionId],
    ),
    buildStatement(
      'pi_automations',
      'update pi_automations set next_run_at = $1, updated_at = $2 where id = $3',
      [params.nextRunAt, params.now, params.automationId],
    ),
    buildStatement(
      'pi_automation_runs',
      'insert into pi_automation_runs (id, automation_id, thread_id, execution_id, status, scheduled_at, started_at, completed_at) values ($1, $2, $3, $4, $5, $6, $7, null)',
      [params.nextRunId, params.automationId, params.threadId, params.nextExecutionId, 'scheduled', params.now, null],
    ),
    buildStatement(
      'pi_executions',
      'insert into pi_executions (id, thread_id, automation_run_id, status, source, current_interrupt_id, created_at, updated_at, completed_at) values ($1, $2, $3, $4, $5, null, $6, $7, null) on conflict (id) do update set status = excluded.status, updated_at = excluded.updated_at',
      [params.nextExecutionId, params.threadId, params.nextRunId, 'queued', 'automation', params.now, params.now],
    ),
    buildStatement(
      'pi_scheduler_leases',
      'insert into pi_scheduler_leases (automation_id, owner_id, lease_expires_at, last_heartbeat_at) values ($1, $2, $3, $4) on conflict (automation_id) do update set owner_id = excluded.owner_id, lease_expires_at = excluded.lease_expires_at, last_heartbeat_at = excluded.last_heartbeat_at',
      [params.automationId, `scheduler:${params.commandName}`, params.leaseExpiresAt, params.now],
    ),
    buildStatement(
      'pi_execution_events',
      'insert into pi_execution_events (id, execution_id, thread_id, event_kind, payload, created_at) values ($1, $2, $3, $4, $5, $6)',
      [
        params.eventId,
        params.currentExecutionId,
        params.threadId,
        'automation-executed',
        JSON.stringify({
          automationId: params.automationId,
          nextRunId: params.nextRunId,
          nextExecutionId: params.nextExecutionId,
          schedulePayload: params.schedulePayload,
        }),
        params.now,
      ],
    ),
    buildStatement(
      'pi_thread_activity',
      'insert into pi_thread_activity (id, thread_id, execution_id, activity_kind, payload, created_at) values ($1, $2, $3, $4, $5, $6)',
      [
        params.activityId,
        params.threadId,
        params.currentExecutionId,
        'automation-executed',
        JSON.stringify({
          automationId: params.automationId,
          nextRunAt: params.nextRunAt,
        }),
        params.now,
      ],
    ),
  ];
}

export function buildCancelAutomationStatements(params: {
  automationId: string;
  currentRunId: string | null;
  currentExecutionId: string | null;
  threadId: string;
  eventId: string;
  activityId: string;
  now: Date;
}): PostgresStatement[] {
  const statements: PostgresStatement[] = [
    buildStatement(
      'pi_automations',
      'update pi_automations set suspended = $1, next_run_at = $2, updated_at = $3 where id = $4',
      [true, null, params.now, params.automationId],
    ),
  ];

  if (params.currentRunId !== null) {
    statements.push(
      buildStatement(
        'pi_automation_runs',
        "update pi_automation_runs set status = $1, completed_at = $2 where id = $3 and status = 'scheduled'",
        ['canceled', params.now, params.currentRunId],
      ),
    );
  }

  if (params.currentExecutionId !== null) {
    statements.push(
      buildStatement(
        'pi_executions',
        'update pi_executions set status = $1, updated_at = $2, completed_at = $3 where id = $4',
        ['completed', params.now, params.now, params.currentExecutionId],
      ),
    );
  }

  statements.push(
    buildStatement(
      'pi_scheduler_leases',
      'delete from pi_scheduler_leases where automation_id = $1',
      [params.automationId],
    ),
    buildStatement(
      'pi_execution_events',
      'insert into pi_execution_events (id, execution_id, thread_id, event_kind, payload, created_at) values ($1, $2, $3, $4, $5, $6)',
      [
        params.eventId,
        params.currentExecutionId,
        params.threadId,
        'automation-canceled',
        JSON.stringify({
          automationId: params.automationId,
        }),
        params.now,
      ],
    ),
    buildStatement(
      'pi_thread_activity',
      'insert into pi_thread_activity (id, thread_id, execution_id, activity_kind, payload, created_at) values ($1, $2, $3, $4, $5, $6)',
      [
        params.activityId,
        params.threadId,
        params.currentExecutionId,
        'automation-canceled',
        JSON.stringify({
          automationId: params.automationId,
        }),
        params.now,
      ],
    ),
  );

  return statements;
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
    ...buildPersistExecutionCheckpointStatements({
      executionId: params.executionId,
      threadId: params.threadId,
      automationRunId: null,
      status: 'interrupted',
      source: 'system',
      currentInterruptId: params.interruptId,
      interruptType: 'input-required',
      interruptPayload: {},
      mirroredToActivity: true,
      now: params.now,
    }),
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
