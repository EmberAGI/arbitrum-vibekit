import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createCanonicalPiRuntimeGatewayControlPlane, createPiRuntimeGatewayService } from './index.js';

describe('agent-runtime-pi package contract', () => {
  it('anchors the gateway service on the real Pi foundation and shared runtime layers', () => {
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

    expect(packageJson.name).toBe('agent-runtime-pi');
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
      '@ag-ui/client': '0.0.42',
      '@mariozechner/pi-agent-core': expect.any(String),
      '@mariozechner/pi-ai': expect.any(String),
      'agent-runtime-contracts': 'workspace:^',
      'agent-runtime-postgres': 'workspace:^',
    });
    expect(packageJson.scripts).toMatchObject({
      'build:deps': expect.any(String),
      build: expect.any(String),
      lint: expect.any(String),
      prebuild: expect.any(String),
      test: expect.any(String),
      'test:ci': expect.any(String),
    });
  });

  it('creates an AG-UI gateway surface without collapsing operator controls into runtime commands', async () => {
    const runtime = {
      connect: vi.fn(async () => [{ type: 'STATE_SNAPSHOT' }]),
      run: vi.fn(async () => [{ type: 'RUN_STARTED' }]),
      stop: vi.fn(async () => undefined),
    };
    const controlPlane = {
      inspectHealth: vi.fn(async () => ({ status: 'ok' as const })),
      listThreads: vi.fn(async () => ['thread-1']),
      listExecutions: vi.fn(async () => ['exec-1']),
      listAutomations: vi.fn(async () => ['automation-1']),
      listAutomationRuns: vi.fn(async () => ['run-1']),
      inspectScheduler: vi.fn(async () => ({ dueAutomationIds: ['automation-1'], leases: [] })),
      inspectOutbox: vi.fn(async () => ({ dueOutboxIds: ['outbox-1'], intents: [] })),
      inspectMaintenance: vi.fn(async () => ({ recovery: {}, archival: {} })),
    };

    const service = createPiRuntimeGatewayService({
      runtime,
      controlPlane,
    });

    expect(service).toMatchObject({
      connect: expect.any(Function),
      run: expect.any(Function),
      stop: expect.any(Function),
      control: {
        inspectHealth: expect.any(Function),
        listThreads: expect.any(Function),
        listExecutions: expect.any(Function),
        listAutomations: expect.any(Function),
        listAutomationRuns: expect.any(Function),
        inspectScheduler: expect.any(Function),
        inspectOutbox: expect.any(Function),
        inspectMaintenance: expect.any(Function),
      },
    });
    expect(service).not.toHaveProperty('inspectHealth');

    await expect(service.connect({ threadId: 'thread-1' })).resolves.toEqual([{ type: 'STATE_SNAPSHOT' }]);
    await expect(service.run({ threadId: 'thread-1', runId: 'run-1' })).resolves.toEqual([{ type: 'RUN_STARTED' }]);
    await expect(service.stop({ threadId: 'thread-1', runId: 'run-1' })).resolves.toBeUndefined();
    await expect(service.control.inspectHealth()).resolves.toEqual({ status: 'ok' });
    await expect(service.control.listThreads()).resolves.toEqual(['thread-1']);
    await expect(service.control.listExecutions()).resolves.toEqual(['exec-1']);
    await expect(service.control.listAutomations()).resolves.toEqual(['automation-1']);
    await expect(service.control.listAutomationRuns()).resolves.toEqual(['run-1']);
    await expect(service.control.inspectScheduler()).resolves.toEqual({
      dueAutomationIds: ['automation-1'],
      leases: [],
    });
    await expect(service.control.inspectOutbox()).resolves.toEqual({
      dueOutboxIds: ['outbox-1'],
      intents: [],
    });
    await expect(service.control.inspectMaintenance()).resolves.toEqual({
      recovery: {},
      archival: {},
    });
  });

  it('builds canonical operator control reads and maintenance planning from persisted runtime state', async () => {
    const loadInspectionState = vi.fn(async () => ({
      threads: [
        {
          threadId: 'thread-1',
          threadKey: 'wallet:1',
          status: 'active',
          threadState: { phase: 'active' },
          createdAt: new Date('2026-03-20T16:00:00.000Z'),
          updatedAt: new Date('2026-03-20T17:59:00.000Z'),
        },
      ],
      executions: [
        {
          executionId: 'exec-queued',
          threadId: 'thread-1',
          automationRunId: null,
          status: 'queued' as const,
          source: 'user' as const,
          currentInterruptId: null,
          createdAt: new Date('2026-03-20T17:40:00.000Z'),
          updatedAt: new Date('2026-03-20T17:59:00.000Z'),
          completedAt: null,
        },
      ],
      automations: [
        {
          automationId: 'automation-1',
          threadId: 'thread-1',
          commandName: 'sync',
          cadence: 'interval',
          schedulePayload: { minutes: 5 },
          suspended: false,
          nextRunAt: new Date('2026-03-20T17:45:00.000Z'),
          createdAt: new Date('2026-03-20T16:00:00.000Z'),
          updatedAt: new Date('2026-03-20T17:40:00.000Z'),
        },
      ],
      automationRuns: [
        {
          runId: 'run-1',
          automationId: 'automation-1',
          threadId: 'thread-1',
          executionId: 'exec-queued',
          status: 'scheduled' as const,
          scheduledAt: new Date('2026-03-20T17:45:00.000Z'),
          startedAt: null,
          completedAt: null,
        },
      ],
      interrupts: [
        {
          interruptId: 'interrupt-1',
          executionId: 'exec-queued',
          threadId: 'thread-1',
          status: 'pending' as const,
          surfacedInThread: true,
        },
      ],
      leases: [],
      outboxIntents: [
        {
          outboxId: 'outbox-1',
          status: 'pending' as const,
          availableAt: new Date('2026-03-20T17:30:00.000Z'),
          deliveredAt: null,
        },
      ],
      executionEvents: [],
      threadActivities: [],
    }));

    const controlPlane = createCanonicalPiRuntimeGatewayControlPlane({
      loadInspectionState,
      now: () => new Date('2026-03-20T18:00:00.000Z'),
      retention: {
        completedExecutionMs: 24 * 60 * 60 * 1000,
        completedAutomationRunMs: 24 * 60 * 60 * 1000,
        executionEventMs: 12 * 60 * 60 * 1000,
        threadActivityMs: 12 * 60 * 60 * 1000,
      },
    });

    await expect(controlPlane.inspectHealth()).resolves.toEqual({
      status: 'degraded',
      dueAutomationIds: ['automation-1'],
      dueOutboxIds: ['outbox-1'],
      interruptedExecutionIds: [],
      pendingInterruptIds: ['interrupt-1'],
    });
    await expect(controlPlane.listThreads()).resolves.toEqual([
      expect.objectContaining({ threadId: 'thread-1' }),
    ]);
    await expect(controlPlane.listExecutions()).resolves.toEqual([
      expect.objectContaining({ executionId: 'exec-queued' }),
    ]);
    await expect(controlPlane.listAutomations()).resolves.toEqual([
      expect.objectContaining({ automationId: 'automation-1' }),
    ]);
    await expect(controlPlane.listAutomationRuns()).resolves.toEqual([
      expect.objectContaining({ runId: 'run-1' }),
    ]);
    await expect(controlPlane.inspectScheduler()).resolves.toEqual({
      dueAutomationIds: ['automation-1'],
      leases: [],
    });
    await expect(controlPlane.inspectOutbox()).resolves.toEqual({
      dueOutboxIds: ['outbox-1'],
      intents: [
        {
          outboxId: 'outbox-1',
          status: 'pending',
          availableAt: new Date('2026-03-20T17:30:00.000Z'),
          deliveredAt: null,
        },
      ],
    });
    await expect(controlPlane.inspectMaintenance()).resolves.toEqual({
      recovery: {
        automationIdsToResume: ['automation-1'],
        executionIdsToResume: ['exec-queued'],
        outboxIdsToReplay: ['outbox-1'],
        interruptIdsToResurface: ['interrupt-1'],
      },
      archival: {
        executionIds: [],
        automationRunIds: [],
        executionEventIds: [],
        threadActivityIds: [],
      },
    });
    expect(loadInspectionState).toHaveBeenCalled();
  });
});
