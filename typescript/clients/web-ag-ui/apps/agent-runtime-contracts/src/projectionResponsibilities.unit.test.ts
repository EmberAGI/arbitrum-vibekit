import { describe, expect, it } from 'vitest';

import {
  PI_PROJECTION_RESPONSIBILITIES,
  PI_PROJECTION_SURFACES,
  PI_RUNTIME_FOUNDATION_BOUNDARY,
  PI_RUNTIME_RECORD_KINDS,
} from './index.js';

describe('projectionResponsibilities', () => {
  it('defines the durable Pi runtime records layered above the pi-agent-core stream', () => {
    expect(PI_RUNTIME_RECORD_KINDS).toEqual([
      'thread',
      'execution',
      'automation',
      'automation-run',
    ]);

    expect(PI_RUNTIME_FOUNDATION_BOUNDARY).toEqual({
      foundationPackage: '@mariozechner/pi-agent-core',
      foundationOwns: ['agent-loop', 'event-stream', 'turn-lifecycle', 'message-lifecycle'],
      durableRuntimeRecords: ['thread', 'execution', 'automation', 'automation-run'],
      rawEventStreamIsDurableIdentity: false,
    });
  });

  it('defines the supported projection surfaces', () => {
    expect(PI_PROJECTION_SURFACES).toEqual(['ag-ui', 'a2a', 'channel']);
  });

  it('maps AG-UI projection responsibilities to canonical thread and execution records', () => {
    expect(PI_PROJECTION_RESPONSIBILITIES['ag-ui']).toEqual({
      canonicalSources: ['thread', 'execution'],
      projectedIds: ['threadId', 'thread.task.id'],
      exposes: ['thread-state', 'task-view', 'visible-artifacts', 'activity-history', 'interrupts'],
      transportRole: 'control-plane-run-and-connect',
      createsDurableIdentity: false,
    });
  });

  it('maps A2A projection responsibilities to canonical thread and execution records', () => {
    expect(PI_PROJECTION_RESPONSIBILITIES['a2a']).toEqual({
      canonicalSources: ['thread', 'execution'],
      projectedIds: ['contextId', 'taskId'],
      exposes: ['task-view', 'artifact-references', 'status-events'],
      transportRole: 'protocol-task-surface',
      createsDurableIdentity: false,
    });
  });

  it('maps channel-visible status responsibilities without making channels the runtime substrate', () => {
    expect(PI_PROJECTION_RESPONSIBILITIES['channel']).toEqual({
      canonicalSources: ['thread', 'execution', 'automation', 'automation-run'],
      projectedIds: ['threadId', 'executionId', 'automationId', 'automationRunId'],
      exposes: ['visible-status', 'current-state-artifact', 'activity-history'],
      transportRole: 'adapter-specific-view',
      createsDurableIdentity: false,
    });
  });
});
