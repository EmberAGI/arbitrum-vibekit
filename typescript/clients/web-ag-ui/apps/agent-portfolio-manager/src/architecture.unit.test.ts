import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('agent-portfolio-manager architecture boundary', () => {
  it('consumes the blessed agent-runtime builder path instead of low-level runtime assembly helpers', () => {
    const agUiServerSource = readFileSync(new URL('./agUiServer.ts', import.meta.url), 'utf8');
    const startupSource = readFileSync(new URL('./startup.ts', import.meta.url), 'utf8');

    expect(agUiServerSource).toContain('createAgentRuntime');
    expect(agUiServerSource).toContain("from 'agent-runtime'");
    expect(agUiServerSource).toContain('service.createAgUiHandler');
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
    expect(agUiServerSource).not.toContain("from 'agent-runtime/pi-transport'");
    expect(startupSource).not.toContain('ensurePiRuntimePostgresReady');
    expect(startupSource).not.toContain('bootstrapPlan');
    expect(startupSource).not.toContain('automationScheduler');
    expect(startupSource).not.toContain('runtimeState');
    expect(startupSource).not.toContain('scheduler:');
  });
});
