import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  installCopilotRuntimeDebugFilter,
  isCopilotRuntimeDebugLog,
  resetCopilotRuntimeDebugFilterForTests,
} from './copilotRuntimeDebugFilter';

describe('copilotRuntimeDebugFilter', () => {
  afterEach(() => {
    resetCopilotRuntimeDebugFilterForTests();
  });

  it('detects runtime debug prefixes', () => {
    expect(isCopilotRuntimeDebugLog(['[LangGraphAgent.connect] init', { threadId: 't1' }])).toBe(true);
    expect(isCopilotRuntimeDebugLog(['[AbstractAgent.connectAgent]', { threadId: 't1' }])).toBe(true);
    expect(isCopilotRuntimeDebugLog(['[CopilotRuntime.handleConnect] register'])).toBe(true);
    expect(isCopilotRuntimeDebugLog(['[TelemetryAgentRunner.connect] start'])).toBe(true);
  });

  it('does not match unrelated debug entries', () => {
    expect(isCopilotRuntimeDebugLog(['[fireAgentRun][debug]', { threadId: 't1' }])).toBe(false);
    expect(isCopilotRuntimeDebugLog(['some-other-debug-message'])).toBe(false);
    expect(isCopilotRuntimeDebugLog([undefined])).toBe(false);
  });

  it('filters runtime debug entries when disabled', () => {
    const debugSpy = vi.fn();
    console.debug = debugSpy;

    installCopilotRuntimeDebugFilter({ enabled: false });

    console.debug('[LangGraphAgent.connect] init', { threadId: 't1' });
    console.debug('[fireAgentRun][debug]', { threadId: 't1' });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith('[fireAgentRun][debug]', { threadId: 't1' });
  });

  it('does not install a filter when explicitly enabled', () => {
    const debugSpy = vi.fn();
    console.debug = debugSpy;

    installCopilotRuntimeDebugFilter({ enabled: true });

    console.debug('[LangGraphAgent.connect] init', { threadId: 't1' });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith('[LangGraphAgent.connect] init', { threadId: 't1' });
  });
});
