import { describe, expect, it } from 'vitest';

import * as runtimeContracts from 'pi-runtime-legacy-contracts';
import * as runtimeLanggraph from 'agent-runtime-langgraph';

import * as workflowCore from './index.js';

describe('package boundaries', () => {
  it('exposes legacy workflow compatibility contracts from pi-runtime-legacy-contracts', () => {
    expect(runtimeContracts.TASK_STATES).toContain('working');
    expect(typeof runtimeContracts.isTaskTerminalState).toBe('function');
    expect(typeof runtimeContracts.resolveThreadLifecyclePhase).toBe('function');
    expect(typeof runtimeContracts.requestInterruptPayload).toBe('function');
    expect(typeof runtimeContracts.mergeThreadPatchForEmit).toBe('function');
    expect(typeof runtimeContracts.buildNodeTransition).toBe('function');
    expect(typeof runtimeContracts.shouldPersistInputRequiredCheckpoint).toBe('function');
  });

  it('isolates LangGraph-specific helpers in agent-runtime-langgraph', () => {
    expect(typeof runtimeLanggraph.configureLangGraphApiCheckpointer).toBe('function');
    expect(typeof runtimeLanggraph.loadLangGraphApiCheckpointer).toBe('function');
    expect(typeof runtimeLanggraph.pruneCheckpointerState).toBe('function');
    expect(typeof runtimeLanggraph.isLangGraphBusyStatus).toBe('function');
  });

  it('no longer exposes extracted runtime-neutral or LangGraph helpers from agent-workflow-core', () => {
    expect('TASK_STATES' in workflowCore).toBe(false);
    expect('isTaskTerminalState' in workflowCore).toBe(false);
    expect('resolveThreadLifecyclePhase' in workflowCore).toBe(false);
    expect('requestInterruptPayload' in workflowCore).toBe(false);
    expect('mergeThreadPatchForEmit' in workflowCore).toBe(false);
    expect('buildNodeTransition' in workflowCore).toBe(false);
    expect('shouldPersistInputRequiredCheckpoint' in workflowCore).toBe(false);
    expect('configureLangGraphApiCheckpointer' in workflowCore).toBe(false);
    expect('loadLangGraphApiCheckpointer' in workflowCore).toBe(false);
    expect('pruneCheckpointerState' in workflowCore).toBe(false);
    expect('isLangGraphBusyStatus' in workflowCore).toBe(false);
  });
});
