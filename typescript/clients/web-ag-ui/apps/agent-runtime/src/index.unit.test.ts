import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as agentRuntime from './index.js';

describe('agent-runtime facade', () => {
  it('defines the single builder-facing package over the Pi runtime family', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      name?: string;
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.name).toBe('agent-runtime');
    expect(packageJson.dependencies).toMatchObject({
      'agent-runtime-contracts': 'workspace:^',
      'agent-runtime-pi': 'workspace:^',
    });
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-postgres');
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-langgraph');
    expect(packageJson.dependencies).not.toHaveProperty('agent-workflow-core');
    expect(packageJson.scripts).toMatchObject({
      build: expect.any(String),
      lint: expect.any(String),
      test: expect.any(String),
      'test:ci': expect.any(String),
    });
  });

  it('re-exports builder-facing contracts and Pi gateway factories without leaking LangGraph or workflow-core helpers', () => {
    expect(agentRuntime.TASK_STATES).toContain('working');
    expect(typeof agentRuntime.defineAgentDomainModule).toBe('function');
    expect(typeof agentRuntime.createPiRuntimeGatewayFoundation).toBe('function');
    expect(typeof agentRuntime.createPiRuntimeGatewayRuntime).toBe('function');
    expect(typeof agentRuntime.createPiRuntimeGatewayService).toBe('function');

    expect('resolvePostgresBootstrapPlan' in agentRuntime).toBe(false);
    expect('configureLangGraphApiCheckpointer' in agentRuntime).toBe(false);
    expect('loadLangGraphApiCheckpointer' in agentRuntime).toBe(false);
    expect('pruneCheckpointerState' in agentRuntime).toBe(false);
    expect('isLangGraphBusyStatus' in agentRuntime).toBe(false);
  });
});
