import { readFileSync } from 'node:fs';

import type { Model } from '@mariozechner/pi-ai';
import { describe, expect, it } from 'vitest';

import * as agentRuntime from './index.js';

function createModel(id: string): Model<'openai-responses'> {
  return {
    id,
    name: id,
    api: 'openai-responses',
    provider: 'openai',
    baseUrl: 'https://example.invalid',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192,
    maxTokens: 2048,
  };
}

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

  it('does not let normal consumers override runtime ownership through the blessed builder options', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const declarations = readFileSync(new URL('../dist/index.d.ts', import.meta.url), 'utf8');
    const publicDomainContract = source.slice(
      source.indexOf('export type AgentRuntimeDomainOperation'),
      source.indexOf('type AgentRuntimeForwardedCommand'),
    );
    const builderContract = source.slice(
      source.indexOf('export interface CreateAgentRuntimeOptions'),
      source.indexOf('type AgentRuntimeInstance'),
    );

    expect(source).not.toContain('runtime?:');
    expect(source).not.toContain('options.runtime?.(');
    expect(source).not.toContain('attached?: AgentRuntimeAttachedSessions');
    expect(source).not.toContain('sessions.attached');
    expect(source).not.toContain('publishSessionSnapshot:');
    expect(source).not.toContain('<agent-runtime-domain-context>');
    expect(publicDomainContract).not.toContain('channel?:');
    expect(publicDomainContract).not.toContain('append?:');
    expect(publicDomainContract).not.toContain('threadPatch?:');
    expect(publicDomainContract).not.toContain('inputLabel?:');
    expect(publicDomainContract).not.toContain('submitLabel?:');
    expect(publicDomainContract).not.toContain('session: PiRuntimeGatewaySession');
    expect(builderContract).not.toContain('Omit<');
    expect(source).not.toContain("Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0]['agentOptions']");
    expect(source).not.toContain("Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0]['tools']");
    expect(source).not.toContain("ReturnType<typeof createPiRuntimeGatewayFoundationInternal>['bootstrapPlan']");
    expect(declarations).not.toContain('createPiRuntimeGatewayFoundationInternal');
    expect(declarations).not.toContain('Parameters<typeof createPiRuntimeGatewayFoundationInternal>');
    expect(declarations).not.toContain('ReturnType<typeof createPiRuntimeGatewayFoundationInternal>');
    expect(source).toContain('PiRuntimeGatewayService,');
    expect(source).toContain('export type AgentRuntimeDomainContext');
    expect(source).toContain('export interface CreateAgentRuntimeOptions');
  });

  it('owns sessions and control-plane defaults inside the blessed builder', async () => {
    const runtime = agentRuntime.createAgentRuntime({
      model: createModel('unit-model'),
      systemPrompt: 'You are a lifecycle agent.',
    });

    expect(runtime).toMatchObject({
      bootstrapPlan: expect.any(Object),
      service: expect.objectContaining({
        connect: expect.any(Function),
        run: expect.any(Function),
        stop: expect.any(Function),
        control: expect.objectContaining({
          listThreads: expect.any(Function),
        }),
      }),
    });
    expect('publishSessionSnapshot' in runtime).toBe(false);

    await expect(runtime.service.control.listThreads()).resolves.toEqual([]);
    await expect(runtime.service.control.listAutomations()).resolves.toEqual([]);
  });

  it('syncs postgres artifacts into installed agent-runtime snapshots for clean workspace consumers', () => {
    const syncScript = readFileSync(
      new URL('../scripts/sync-installed-artifacts.mjs', import.meta.url),
      'utf8',
    );

    expect(syncScript).toContain("path.join('lib', 'postgres', 'dist')");
  });

  it('rejects lifecycle declarations whose transitions reference undeclared phases', () => {
    expect(() =>
      agentRuntime.createAgentRuntime({
        model: createModel('unit-model'),
        systemPrompt: 'You are a lifecycle agent.',
        domain: {
          lifecycle: {
            initialPhase: 'prehire',
            phases: ['prehire', 'hired'],
            terminalPhases: ['hired'],
            commands: [{ name: 'hire', description: 'Hire the agent.' }],
            transitions: [
              {
                command: 'hire',
                from: ['prehire'],
                to: 'onboarding',
                description: 'Move into onboarding.',
              },
            ],
            interrupts: [],
          },
        },
      }),
    ).toThrow(/undeclared phase/i);
  });

  it('rejects lifecycle declarations whose terminal phases are not declared', () => {
    expect(() =>
      agentRuntime.createAgentRuntime({
        model: createModel('unit-model'),
        systemPrompt: 'You are a lifecycle agent.',
        domain: {
          lifecycle: {
            initialPhase: 'prehire',
            phases: ['prehire', 'hired'],
            terminalPhases: ['fired'],
            commands: [{ name: 'hire', description: 'Hire the agent.' }],
            transitions: [
              {
                command: 'hire',
                from: ['prehire'],
                to: 'hired',
                description: 'Hire the agent.',
              },
            ],
            interrupts: [],
          },
        },
      }),
    ).toThrow(/terminal phase/i);
  });
});
