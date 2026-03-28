import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('agent-pi-example architecture boundary', () => {
  it('consumes the blessed agent-runtime builder path instead of low-level runtime assembly helpers', () => {
    const agUiServerSource = readFileSync(new URL('./agUiServer.ts', import.meta.url), 'utf8');
    const foundationSource = readFileSync(new URL('./piExampleFoundation.ts', import.meta.url), 'utf8');
    const startupSource = readFileSync(new URL('./startup.ts', import.meta.url), 'utf8');

    expect(agUiServerSource).toContain('createAgentRuntime');
    expect(agUiServerSource).not.toContain('attached: {');
    expect(agUiServerSource).not.toContain('runtime: (');
    expect(agUiServerSource).not.toContain('attachToThread(');
    expect(agUiServerSource).not.toContain('startAttachedRun(');
    expect(agUiServerSource).not.toContain('appendAttachedRunEvents(');
    expect(agUiServerSource).not.toContain('finishAttachedRun(');
    expect(agUiServerSource).not.toContain('resumeFromUserInput(');
    expect(agUiServerSource).not.toContain('runtimeState');
    expect(agUiServerSource).not.toContain('sessions: {');
    expect(agUiServerSource).not.toContain('controlPlane: {');
    expect(agUiServerSource).not.toContain('persistThreadExecution');
    expect(agUiServerSource).not.toContain('createPiRuntimeGatewayRuntime');
    expect(agUiServerSource).not.toContain('createPiRuntimeGatewayService');
    expect(foundationSource).not.toContain('createPiRuntimeGatewayFoundation');
    expect(foundationSource).not.toContain('const AUTOMATION_SCHEDULE_TOOL');
    expect(foundationSource).not.toContain('const AUTOMATION_LIST_TOOL');
    expect(foundationSource).not.toContain('const AUTOMATION_CANCEL_TOOL');
    expect(foundationSource).not.toContain('const REQUEST_OPERATOR_INPUT_TOOL');
    expect(foundationSource).not.toContain('runtimeState');
    expect(foundationSource).not.toContain('persistence:');
    expect(foundationSource).not.toContain('getSessionContext');
    expect(startupSource).not.toContain('automationScheduler');
    expect(startupSource).not.toContain('startPiExampleAutomationScheduler');
    expect(startupSource).not.toContain('runtimeState');
    expect(startupSource).not.toContain('scheduler:');
  });
});
