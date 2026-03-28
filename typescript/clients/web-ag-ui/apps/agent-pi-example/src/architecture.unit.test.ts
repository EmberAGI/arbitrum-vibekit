import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('agent-pi-example architecture boundary', () => {
  it('consumes the blessed agent-runtime builder path instead of low-level runtime assembly helpers', () => {
    const agUiServerSource = readFileSync(new URL('./agUiServer.ts', import.meta.url), 'utf8');
    const foundationSource = readFileSync(new URL('./piExampleFoundation.ts', import.meta.url), 'utf8');

    expect(agUiServerSource).toContain('createAgentRuntime');
    expect(agUiServerSource).not.toContain('runtime: (');
    expect(agUiServerSource).not.toContain('attachToThread(');
    expect(agUiServerSource).not.toContain('startAttachedRun(');
    expect(agUiServerSource).not.toContain('appendAttachedRunEvents(');
    expect(agUiServerSource).not.toContain('finishAttachedRun(');
    expect(agUiServerSource).not.toContain('resumeFromUserInput(');
    expect(agUiServerSource).not.toContain('createPiRuntimeGatewayRuntime');
    expect(agUiServerSource).not.toContain('createPiRuntimeGatewayService');
    expect(foundationSource).not.toContain('createPiRuntimeGatewayFoundation');
  });
});
