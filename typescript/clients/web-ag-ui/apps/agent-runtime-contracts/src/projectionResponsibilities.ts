export const PI_RUNTIME_RECORD_KINDS = [
  'thread',
  'execution',
  'automation',
  'automation-run',
] as const;

export type PiRuntimeRecordKind = (typeof PI_RUNTIME_RECORD_KINDS)[number];

export const PI_PROJECTION_SURFACES = ['ag-ui', 'a2a', 'channel'] as const;

export type PiProjectionSurface = (typeof PI_PROJECTION_SURFACES)[number];

export type ProjectionResponsibility = {
  canonicalSources: PiRuntimeRecordKind[];
  projectedIds: string[];
  exposes: string[];
  transportRole: string;
  createsDurableIdentity: boolean;
};

export const PI_RUNTIME_FOUNDATION_BOUNDARY = {
  foundationPackage: '@mariozechner/pi-agent-core',
  foundationOwns: ['agent-loop', 'event-stream', 'turn-lifecycle', 'message-lifecycle'],
  durableRuntimeRecords: [...PI_RUNTIME_RECORD_KINDS],
  rawEventStreamIsDurableIdentity: false,
} as const;

export const PI_PROJECTION_RESPONSIBILITIES: Record<PiProjectionSurface, ProjectionResponsibility> = {
  'ag-ui': {
    canonicalSources: ['thread', 'execution'],
    projectedIds: ['threadId', 'thread.task.id'],
    exposes: ['thread-state', 'task-view', 'visible-artifacts', 'activity-history', 'interrupts'],
    transportRole: 'control-plane-run-and-connect',
    createsDurableIdentity: false,
  },
  a2a: {
    canonicalSources: ['thread', 'execution'],
    projectedIds: ['contextId', 'taskId'],
    exposes: ['task-view', 'artifact-references', 'status-events'],
    transportRole: 'protocol-task-surface',
    createsDurableIdentity: false,
  },
  channel: {
    canonicalSources: ['thread', 'execution', 'automation', 'automation-run'],
    projectedIds: ['threadId', 'executionId', 'automationId', 'automationRunId'],
    exposes: ['visible-status', 'current-state-artifact', 'activity-history'],
    transportRole: 'adapter-specific-view',
    createsDurableIdentity: false,
  },
};
