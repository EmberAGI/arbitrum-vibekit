import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as agentRuntime from './index.js';

describe('agent-runtime facade', () => {
  it('defines the single builder-facing package over the Pi runtime family', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      name?: string;
      exports?: Record<string, unknown>;
      main?: string;
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      types?: string;
    };

    expect(packageJson.name).toBe('agent-runtime');
    expect(packageJson.main).toBe('dist/index.js');
    expect(packageJson.types).toBe('dist/index.d.ts');
    expect(packageJson.exports).toMatchObject({
      '.': {
        default: './dist/index.js',
        types: './dist/index.d.ts',
      },
      './pi-transport': {
        default: './dist/piTransport.js',
        types: './dist/piTransport.d.ts',
      },
    });
    expect(packageJson.dependencies).toMatchObject({
      'agent-runtime-contracts': 'workspace:^',
      'agent-runtime-pi': 'workspace:^',
    });
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-postgres');
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-langgraph');
    expect(packageJson.dependencies).not.toHaveProperty('agent-workflow-core');
    expect(packageJson.scripts).toMatchObject({
      'build:deps': expect.any(String),
      build: expect.any(String),
      lint: expect.any(String),
      prebuild: expect.any(String),
      test: expect.any(String),
      'test:ci': expect.any(String),
    });
  });

  it('keeps low-level runtime assembly out of the normal public facade while preserving the shared runtime boundary', () => {
    expect(agentRuntime.TASK_STATES).toContain('working');
    expect(typeof agentRuntime.createAgentRuntime).toBe('function');
    expect(typeof agentRuntime.defineAgentDomainModule).toBe('function');
    expect(typeof agentRuntime.createPiRuntimeGatewayAgUiHandler).toBe('function');
    expect(typeof agentRuntime.buildPiRuntimeDirectExecutionRecordIds).toBe('function');
    expect(typeof agentRuntime.createCanonicalPiRuntimeGatewayControlPlane).toBe('function');
    expect(typeof agentRuntime.ensurePiRuntimePostgresReady).toBe('function');
    expect(typeof agentRuntime.PiRuntimeGatewayHttpAgent).toBe('function');
    expect(agentRuntime.DEFAULT_PI_RUNTIME_GATEWAY_RETENTION).toMatchObject({
      completedExecutionMs: expect.any(Number),
      completedAutomationRunMs: expect.any(Number),
      executionEventMs: expect.any(Number),
      threadActivityMs: expect.any(Number),
    });

    expect('createPiRuntimeGatewayFoundation' in agentRuntime).toBe(false);
    expect('createPiRuntimeGatewayRuntime' in agentRuntime).toBe(false);
    expect('createPiRuntimeGatewayService' in agentRuntime).toBe(false);
    expect('PiRuntimeGatewaySession' in agentRuntime).toBe(false);

    expect('resolvePostgresBootstrapPlan' in agentRuntime).toBe(false);
    expect('configureLangGraphApiCheckpointer' in agentRuntime).toBe(false);
    expect('loadLangGraphApiCheckpointer' in agentRuntime).toBe(false);
    expect('pruneCheckpointerState' in agentRuntime).toBe(false);
    expect('isLangGraphBusyStatus' in agentRuntime).toBe(false);
  });

  it('syncs postgres artifacts into installed agent-runtime snapshots for clean workspace consumers', () => {
    const syncScript = readFileSync(
      new URL('../scripts/sync-installed-artifacts.mjs', import.meta.url),
      'utf8',
    );

    expect(syncScript).toContain("path.join('lib', 'postgres', 'dist')");
  });
});
