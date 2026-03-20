import type { CoreRuntimeRecord } from './domainModule.js';
import type {
  PiRuntimeHistoryRecord,
  PiRuntimeSupportingRecord,
  PiRuntimeTransactionBoundaryName,
} from './piRuntimePersistence.js';

export type PiCorePersistenceSource =
  | 'messageHistory'
  | 'executionLifecycle'
  | 'interruptEmission'
  | 'automationDispatch'
  | 'sideEffectIntent';

export type PiDurableRuntimeRecord =
  | CoreRuntimeRecord
  | PiRuntimeSupportingRecord
  | PiRuntimeHistoryRecord;

export type PiCorePersistenceMapping = {
  source: PiCorePersistenceSource;
  durableRecords: readonly PiDurableRuntimeRecord[];
  transactionBoundary: PiRuntimeTransactionBoundaryName;
};

export const piCorePersistenceMappings = [
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
    durableRecords: ['PiExecution', 'PiExecutionEvent', 'PiOutboxIntent', 'PiActionFingerprint'],
    transactionBoundary: 'persistOutboxIntent',
  },
] as const satisfies readonly PiCorePersistenceMapping[];

const mappingsBySource = Object.fromEntries(
  piCorePersistenceMappings.map((mapping) => [mapping.source, [...mapping.durableRecords]]),
) as Record<PiCorePersistenceSource, PiDurableRuntimeRecord[]>;

export const getPersistenceTargetsForSource = (
  source: PiCorePersistenceSource,
): PiDurableRuntimeRecord[] => mappingsBySource[source];
