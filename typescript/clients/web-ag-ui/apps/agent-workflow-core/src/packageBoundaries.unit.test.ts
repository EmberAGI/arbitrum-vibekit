import { describe, expect, it } from 'vitest';

import * as runtimeLanggraph from 'agent-runtime-langgraph';

import * as workflowCore from './index.js';

describe('package boundaries', () => {
  it('owns the shared deprecated-workflow helper surface directly', () => {
    expect(workflowCore.TASK_STATES).toContain('working');
    expect(typeof workflowCore.isTaskTerminalState).toBe('function');
    expect(typeof workflowCore.resolveThreadLifecyclePhase).toBe('function');
    expect(typeof workflowCore.requestInterruptPayload).toBe('function');
    expect(typeof workflowCore.mergeThreadPatchForEmit).toBe('function');
    expect(typeof workflowCore.buildNodeTransition).toBe('function');
    expect(typeof workflowCore.buildInterruptPauseTransition).toBe('function');
    expect(typeof workflowCore.buildTerminalTransition).toBe('function');
    expect(typeof workflowCore.shouldPersistInputRequiredCheckpoint).toBe('function');
    expect(typeof workflowCore.projectCycleCommandThread).toBe('function');
    expect(typeof workflowCore.analyzeCycleProjectionThread).toBe('function');
  });

  it('isolates LangGraph-specific helpers in agent-runtime-langgraph', () => {
    expect(typeof runtimeLanggraph.configureLangGraphApiCheckpointer).toBe('function');
    expect(typeof runtimeLanggraph.loadLangGraphApiCheckpointer).toBe('function');
    expect(typeof runtimeLanggraph.pruneCheckpointerState).toBe('function');
    expect(typeof runtimeLanggraph.isLangGraphBusyStatus).toBe('function');
    expect(typeof runtimeLanggraph.reconcileRecoveredThreadRuns).toBe('function');
    expect(typeof runtimeLanggraph.restorePersistedCronSchedulesWithRunReconciliation).toBe(
      'function',
    );
  });

  it('does not re-export LangGraph runtime helpers from agent-workflow-core', () => {
    expect('configureLangGraphApiCheckpointer' in workflowCore).toBe(false);
    expect('loadLangGraphApiCheckpointer' in workflowCore).toBe(false);
    expect('pruneCheckpointerState' in workflowCore).toBe(false);
    expect('isLangGraphBusyStatus' in workflowCore).toBe(false);
    expect('reconcileRecoveredThreadRuns' in workflowCore).toBe(false);
    expect('restorePersistedCronSchedulesWithRunReconciliation' in workflowCore).toBe(false);
  });
});
