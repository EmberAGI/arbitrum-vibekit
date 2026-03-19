import type { CoreRuntimeRecord } from './domainModule.js';

export type PiRuntimeSupportingRecord =
  | 'PiInterrupt'
  | 'PiArtifact'
  | 'PiSchedulerLease'
  | 'PiOutboxIntent'
  | 'PiActionFingerprint';

export type PiRuntimeHistoryRecord = 'PiExecutionEvent' | 'PiThreadActivity';

export type PiRuntimeTableDefinition<TRecord extends string> = {
  record: TRecord;
  tableName: string;
};

export type PiRuntimeTransactionBoundaryName =
  | 'persistDirectExecution'
  | 'persistAutomationDispatch'
  | 'persistInterruptCheckpoint'
  | 'persistOutboxIntent';

export type PiRuntimeTransactionBoundary = {
  name: PiRuntimeTransactionBoundaryName;
  touches: readonly string[];
};

export type PiRuntimeLayering = {
  piCoreOwns: readonly ['agentLoop', 'toolExecution', 'eventStream'];
  persistenceOwns: readonly [
    'runtimeRecords',
    'interruptCheckpointing',
    'artifactState',
    'schedulerLeases',
    'outboxDedupe',
    'historyProjection',
  ];
};

export type PiRuntimePersistenceModel = {
  currentStateTables: readonly PiRuntimeTableDefinition<CoreRuntimeRecord>[];
  supportingTables: readonly PiRuntimeTableDefinition<PiRuntimeSupportingRecord>[];
  historyTables: readonly PiRuntimeTableDefinition<PiRuntimeHistoryRecord>[];
  runtimeLayering: PiRuntimeLayering;
  transactionBoundaries: readonly PiRuntimeTransactionBoundary[];
};

const currentStateTables = [
  { record: 'PiThread', tableName: 'pi_threads' },
  { record: 'PiExecution', tableName: 'pi_executions' },
  { record: 'PiAutomation', tableName: 'pi_automations' },
  { record: 'AutomationRun', tableName: 'pi_automation_runs' },
] as const satisfies readonly PiRuntimeTableDefinition<CoreRuntimeRecord>[];

const supportingTables = [
  { record: 'PiInterrupt', tableName: 'pi_interrupts' },
  { record: 'PiArtifact', tableName: 'pi_artifacts' },
  { record: 'PiSchedulerLease', tableName: 'pi_scheduler_leases' },
  { record: 'PiOutboxIntent', tableName: 'pi_outbox' },
  { record: 'PiActionFingerprint', tableName: 'pi_action_fingerprints' },
] as const satisfies readonly PiRuntimeTableDefinition<PiRuntimeSupportingRecord>[];

const historyTables = [
  { record: 'PiExecutionEvent', tableName: 'pi_execution_events' },
  { record: 'PiThreadActivity', tableName: 'pi_thread_activity' },
] as const satisfies readonly PiRuntimeTableDefinition<PiRuntimeHistoryRecord>[];

const allTableNames = [...currentStateTables, ...supportingTables, ...historyTables].map(
  ({ tableName }) => tableName,
);

if (new Set(allTableNames).size !== allTableNames.length) {
  throw new Error('Pi runtime persistence tables must use unique names.');
}

const coreRuntimeTableNames = Object.fromEntries(
  currentStateTables.map(({ record, tableName }) => [record, tableName]),
) as Record<CoreRuntimeRecord, string>;

export const piRuntimePersistenceModel = {
  currentStateTables,
  supportingTables,
  historyTables,
  runtimeLayering: {
    piCoreOwns: ['agentLoop', 'toolExecution', 'eventStream'],
    persistenceOwns: [
      'runtimeRecords',
      'interruptCheckpointing',
      'artifactState',
      'schedulerLeases',
      'outboxDedupe',
      'historyProjection',
    ],
  },
  transactionBoundaries: [
    {
      name: 'persistDirectExecution',
      touches: ['pi_threads', 'pi_executions', 'pi_interrupts', 'pi_artifacts', 'pi_thread_activity'],
    },
    {
      name: 'persistAutomationDispatch',
      touches: [
        'pi_automations',
        'pi_automation_runs',
        'pi_executions',
        'pi_scheduler_leases',
        'pi_thread_activity',
      ],
    },
    {
      name: 'persistInterruptCheckpoint',
      touches: ['pi_executions', 'pi_interrupts', 'pi_artifacts', 'pi_thread_activity'],
    },
    {
      name: 'persistOutboxIntent',
      touches: ['pi_executions', 'pi_outbox', 'pi_action_fingerprints', 'pi_execution_events'],
    },
  ],
} as const satisfies PiRuntimePersistenceModel;

export const getCoreRuntimeTableName = (record: CoreRuntimeRecord): string => coreRuntimeTableNames[record];
