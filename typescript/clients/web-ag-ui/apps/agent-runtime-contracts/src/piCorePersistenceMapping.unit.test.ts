import { describe, expect, it } from 'vitest';

import { getPersistenceTargetsForSource, piCorePersistenceMappings } from './index.js';

describe('piCorePersistenceMapping', () => {
  it('maps pi-agent-core surfaces into canonical durable runtime records', () => {
    expect(piCorePersistenceMappings).toEqual([
      {
        source: 'messageHistory',
        durableRecords: ['PiThread', 'PiArtifact', 'PiThreadActivity'],
        transactionBoundary: 'persistDirectExecution',
      },
      {
        source: 'executionLifecycle',
        durableRecords: ['PiExecution', 'PiExecutionEvent'],
        transactionBoundary: 'persistDirectExecution',
      },
      {
        source: 'interruptEmission',
        durableRecords: ['PiExecution', 'PiInterrupt', 'PiArtifact', 'PiThreadActivity'],
        transactionBoundary: 'persistInterruptCheckpoint',
      },
      {
        source: 'automationDispatch',
        durableRecords: ['PiAutomation', 'AutomationRun', 'PiExecution', 'PiThreadActivity'],
        transactionBoundary: 'persistAutomationDispatch',
      },
      {
        source: 'sideEffectIntent',
        durableRecords: [
          'PiExecution',
          'PiExecutionEvent',
          'PiOutboxIntent',
          'PiActionFingerprint',
        ],
        transactionBoundary: 'persistOutboxIntent',
      },
    ]);
    expect(getPersistenceTargetsForSource('interruptEmission')).toEqual([
      'PiExecution',
      'PiInterrupt',
      'PiArtifact',
      'PiThreadActivity',
    ]);
  });
});
