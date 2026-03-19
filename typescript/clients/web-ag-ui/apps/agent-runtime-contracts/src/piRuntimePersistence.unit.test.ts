import { describe, expect, it } from 'vitest';

import { getCoreRuntimeTableName, piRuntimePersistenceModel } from './index.js';

describe('piRuntimePersistence', () => {
  it('defines canonical Postgres tables for Pi runtime records and durability support rows', () => {
    expect(piRuntimePersistenceModel.currentStateTables).toEqual([
      { record: 'PiThread', tableName: 'pi_threads' },
      { record: 'PiExecution', tableName: 'pi_executions' },
      { record: 'PiAutomation', tableName: 'pi_automations' },
      { record: 'AutomationRun', tableName: 'pi_automation_runs' },
    ]);
    expect(getCoreRuntimeTableName('PiExecution')).toBe('pi_executions');
    expect(piRuntimePersistenceModel.supportingTables).toEqual([
      { record: 'PiInterrupt', tableName: 'pi_interrupts' },
      { record: 'PiArtifact', tableName: 'pi_artifacts' },
      { record: 'PiSchedulerLease', tableName: 'pi_scheduler_leases' },
      { record: 'PiOutboxIntent', tableName: 'pi_outbox' },
      { record: 'PiActionFingerprint', tableName: 'pi_action_fingerprints' },
    ]);
    expect(piRuntimePersistenceModel.historyTables).toEqual([
      { record: 'PiExecutionEvent', tableName: 'pi_execution_events' },
      { record: 'PiThreadActivity', tableName: 'pi_thread_activity' },
    ]);
  });

  it('defines transaction boundaries that keep durable persistence layered around pi-agent-core', () => {
    expect(piRuntimePersistenceModel.runtimeLayering).toEqual({
      piCoreOwns: ['agentLoop', 'toolExecution', 'eventStream'],
      persistenceOwns: [
        'runtimeRecords',
        'interruptCheckpointing',
        'artifactState',
        'schedulerLeases',
        'outboxDedupe',
        'historyProjection',
      ],
    });
    expect(piRuntimePersistenceModel.transactionBoundaries).toEqual([
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
    ]);
  });
});
