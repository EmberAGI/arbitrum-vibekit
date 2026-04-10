import { readFileSync } from 'node:fs';

import type { Model } from '@mariozechner/pi-ai';
import { describe, expect, it, vi } from 'vitest';

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

function createInternalPostgresHooks(
  overrides: Partial<{
    databaseUrl: string;
    loadInspectionState: (options: { databaseUrl: string }) => Promise<{
      threads: unknown[];
      executions: unknown[];
      automations: unknown[];
      automationRuns: unknown[];
      interrupts: unknown[];
      leases: unknown[];
      outboxIntents: unknown[];
      executionEvents: unknown[];
      threadActivities: unknown[];
    }>;
    executeStatements: (databaseUrl: string, statements: readonly string[]) => Promise<void>;
    persistDirectExecution: (options: unknown) => Promise<void>;
  }> = {},
) {
  const databaseUrl = overrides.databaseUrl ?? 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime';
  const ensureReady = vi.fn(async (options?: { env?: { DATABASE_URL?: string } }) => ({
    bootstrapPlan: options?.env?.DATABASE_URL
      ? {
          mode: 'external' as const,
          databaseUrl: options.env.DATABASE_URL,
          startCommand: null,
        }
      : {
          mode: 'local-docker' as const,
          databaseUrl,
          startCommand: 'docker run --name pi-runtime-postgres ...',
        },
    databaseUrl: options?.env?.DATABASE_URL ?? databaseUrl,
    startedLocalDocker: !options?.env?.DATABASE_URL,
  }));
  const loadInspectionState =
    overrides.loadInspectionState ??
    vi.fn(async () => ({
      threads: [],
      executions: [],
      automations: [],
      automationRuns: [],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    }));
  const executeStatements = overrides.executeStatements ?? vi.fn(async () => undefined);
  const persistDirectExecution = overrides.persistDirectExecution ?? vi.fn(async () => undefined);

  return {
    ensureReady,
    loadInspectionState,
    executeStatements,
    persistDirectExecution,
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
    });
    expect(packageJson.dependencies).toMatchObject({
      'agent-runtime-pi': 'workspace:^',
    });
    expect(packageJson.dependencies).not.toHaveProperty('pi-runtime-legacy-contracts');
    expect(packageJson.dependencies).not.toHaveProperty('agent-runtime-contracts');
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

  it('keeps the package root focused on the blessed runtime builder surface', () => {
    expect(typeof agentRuntime.createAgentRuntime).toBe('function');
    expect(typeof agentRuntime.createAgentRuntimeHttpAgent).toBe('function');

    expect('TASK_STATES' in agentRuntime).toBe(false);
    expect('defineAgentDomainModule' in agentRuntime).toBe(false);
    expect('createPiRuntimeGatewayAgUiHandler' in agentRuntime).toBe(false);
    expect('buildPiRuntimeDirectExecutionRecordIds' in agentRuntime).toBe(false);
    expect('createCanonicalPiRuntimeGatewayControlPlane' in agentRuntime).toBe(false);
    expect('ensurePiRuntimePostgresReady' in agentRuntime).toBe(false);
    expect('loadPiRuntimeInspectionState' in agentRuntime).toBe(false);
    expect('persistPiRuntimeDirectExecution' in agentRuntime).toBe(false);
    expect('PiRuntimeGatewayHttpAgent' in agentRuntime).toBe(false);
    expect('DEFAULT_PI_RUNTIME_GATEWAY_RETENTION' in agentRuntime).toBe(false);
    expect('buildPiA2UiActivityEvent' in agentRuntime).toBe(false);
    expect('buildPiRuntimeGatewayConnectEvents' in agentRuntime).toBe(false);
    expect('buildPiRuntimeGatewayContextMessages' in agentRuntime).toBe(false);
    expect('createPiRuntimeGatewayMockStream' in agentRuntime).toBe(false);
    expect('convertPiRuntimeGatewayMessagesToLlm' in agentRuntime).toBe(false);
    expect('createPiRuntimeGatewayFoundation' in agentRuntime).toBe(false);
    expect('createPiRuntimeGatewayRuntime' in agentRuntime).toBe(false);
    expect('createPiRuntimeGatewayService' in agentRuntime).toBe(false);
    expect('PiRuntimeGatewaySession' in agentRuntime).toBe(false);
    expect('configureLangGraphApiCheckpointer' in agentRuntime).toBe(false);
    expect('loadLangGraphApiCheckpointer' in agentRuntime).toBe(false);
    expect('pruneCheckpointerState' in agentRuntime).toBe(false);
    expect('isLangGraphBusyStatus' in agentRuntime).toBe(false);
    expect('resolvePostgresBootstrapPlan' in agentRuntime).toBe(false);
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
    expect(source).not.toContain("export * from '../lib/contracts/dist/index.js';");
    expect(publicDomainContract).not.toContain('channel?:');
    expect(publicDomainContract).not.toContain('append?:');
    expect(publicDomainContract).not.toContain('threadPatch?:');
    expect(publicDomainContract).not.toContain('inputLabel?:');
    expect(publicDomainContract).not.toContain('submitLabel?:');
    expect(publicDomainContract).not.toContain('session: PiRuntimeGatewaySession');
    expect(publicDomainContract).not.toContain('PiRuntimeGatewayExecutionStatus');
    expect(builderContract).not.toContain('Omit<');
    expect(source).not.toContain("Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0]['agentOptions']");
    expect(source).not.toContain("Parameters<typeof createPiRuntimeGatewayFoundationInternal>[0]['tools']");
    expect(source).not.toContain("ReturnType<typeof createPiRuntimeGatewayFoundationInternal>['bootstrapPlan']");
    expect(declarations).not.toContain('createPiRuntimeGatewayFoundationInternal');
    expect(declarations).not.toContain('Parameters<typeof createPiRuntimeGatewayFoundationInternal>');
    expect(declarations).not.toContain('ReturnType<typeof createPiRuntimeGatewayFoundationInternal>');
    expect(declarations).not.toContain('PiRuntimeGatewayHttpAgentInternal');
    expect(declarations).not.toContain('PiRuntimeGatewayAgUiHandlerOptions');
    expect(declarations).not.toContain('PiRuntimeGatewayHttpAgentConfig');
    expect(declarations).not.toContain('PiRuntimeGatewayService');
    expect(declarations).not.toContain('PiRuntimeGatewaySession');
    expect(declarations).not.toContain('__internalPostgres');
    expect(publicDomainContract).toContain('export type AgentRuntimeExecutionStatus');
    expect(source).toContain('export type AgentRuntimeDomainContext');
    expect(publicDomainContract).toContain('domainProjectionUpdate?: Record<string, unknown>;');
    expect(source).toContain('export interface CreateAgentRuntimeOptions');
  });

  it('owns sessions and control-plane defaults inside the blessed builder', async () => {
    const internalPostgres = createInternalPostgresHooks();
    const runtime = await agentRuntime.createAgentRuntime({
      model: createModel('unit-model'),
      systemPrompt: 'You are a lifecycle agent.',
      __internalPostgres: internalPostgres,
    } as any);

    expect(runtime).toMatchObject({
      service: expect.objectContaining({
        connect: expect.any(Function),
        run: expect.any(Function),
        stop: expect.any(Function),
        createAgUiHandler: expect.any(Function),
        control: expect.objectContaining({
          listThreads: expect.any(Function),
        }),
      }),
    });
    expect('bootstrapPlan' in runtime).toBe(false);
    expect('publishSessionSnapshot' in runtime).toBe(false);
    expect(internalPostgres.ensureReady).toHaveBeenCalledWith({});

    await expect(runtime.service.control.listThreads()).resolves.toEqual([]);
    await expect(runtime.service.control.listAutomations()).resolves.toEqual([]);
  });

  it('bootstraps the runtime-owned default Postgres when no DATABASE_URL override is supplied', async () => {
    const internalPostgres = createInternalPostgresHooks();

    const runtime = await agentRuntime.createAgentRuntime({
      model: createModel('unit-model'),
      systemPrompt: 'You are a lifecycle agent.',
      __internalPostgres: internalPostgres,
    } as any);

    await runtime.service.control.listThreads();

    expect(internalPostgres.ensureReady).toHaveBeenCalledWith({});
    expect(internalPostgres.loadInspectionState).toHaveBeenCalledWith({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
    });
  });

  it('passes an explicit DATABASE_URL through the runtime-owned bootstrap override path', async () => {
    const internalPostgres = createInternalPostgresHooks({
      databaseUrl: 'postgresql://ignored:ignored@127.0.0.1:55432/ignored',
    });

    await agentRuntime.createAgentRuntime({
      model: createModel('unit-model'),
      systemPrompt: 'You are a lifecycle agent.',
      databaseUrl: 'postgresql://custom-user:custom-pass@db.internal:5432/custom_runtime',
      __internalPostgres: internalPostgres,
    } as any);

    expect(internalPostgres.ensureReady).toHaveBeenCalledWith({
      env: {
        DATABASE_URL: 'postgresql://custom-user:custom-pass@db.internal:5432/custom_runtime',
      },
    });
  });

  it('syncs postgres artifacts into installed agent-runtime snapshots for clean workspace consumers', () => {
    const syncScript = readFileSync(
      new URL('../scripts/sync-installed-artifacts.mjs', import.meta.url),
      'utf8',
    );

    expect(syncScript).not.toContain("packageName: 'pi-runtime-legacy-contracts'");
    expect(syncScript).not.toContain("path.join(packageRoot, '..', 'lib', 'pi-runtime-legacy-contracts')");
    expect(syncScript).not.toContain("packageName: 'agent-runtime-contracts'");
    expect(syncScript).not.toContain("path.join('lib', 'contracts', 'dist')");
    expect(syncScript).toContain("packageName: 'agent-runtime-postgres'");
    expect(syncScript).toContain("path.join('lib', 'postgres', 'dist')");
  });

  it('rejects lifecycle declarations whose transitions reference undeclared phases', async () => {
    await expect(
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
      } as any),
    ).rejects.toThrow(/undeclared phase/i);
  });

  it('rejects lifecycle declarations whose terminal phases are not declared', async () => {
    await expect(
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
      } as any),
    ).rejects.toThrow(/terminal phase/i);
  });
});
