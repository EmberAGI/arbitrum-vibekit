import type { PiRuntimeGatewayService } from 'agent-runtime';
import { describe, expect, it, vi } from 'vitest';

import { createPiExampleAgUiHandler, createPiExampleGatewayService } from './agUiServer';
import { applyAutomationStatusUpdate, createPiExampleRuntimeStateStore } from './runtimeState.js';

const STABLE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createStubService() {
  const connect = vi.fn(async () => [{ type: 'STATE_SNAPSHOT', snapshot: { thread: { id: 'thread-1' } } }] as any[]);
  const run = vi.fn(
    async () =>
      [
        {
          type: 'RUN_FINISHED',
          threadId: 'thread-1',
          runId: 'run-1',
          result: { status: 'completed' },
        },
      ] as any[],
  );
  const stop = vi.fn(
    async () =>
      [
        {
          type: 'RUN_FINISHED',
          threadId: 'thread-1',
          runId: 'run-1',
          result: { status: 'aborted' },
        },
      ] as any[],
  );

  const service: PiRuntimeGatewayService = {
    connect: connect as PiRuntimeGatewayService['connect'],
    run: run as PiRuntimeGatewayService['run'],
    stop: stop as PiRuntimeGatewayService['stop'],
    control: {
      inspectHealth: async () => ({ status: 'ok' }),
      listThreads: async () => [{ threadId: 'thread-1' }],
      listExecutions: async () => [],
      listAutomations: async () => [{ automationId: 'automation-1' }],
      listAutomationRuns: async () => [{ runId: 'run-1' }],
      inspectScheduler: async () => ({ dueAutomationIds: [], leases: [] }),
      inspectOutbox: async () => ({ dueOutboxIds: [], intents: [] }),
      inspectMaintenance: async () => ({ recovery: {}, archival: {} }),
    },
  };

  return { service, connect, run, stop };
}

async function collectEventSource<T>(source: readonly T[] | AsyncIterable<T>): Promise<T[]> {
  if (Array.isArray(source)) {
    return [...source];
  }

  const events: T[] = [];
  for await (const event of source) {
    events.push(event);
  }

  return events;
}

describe('createPiExampleAgUiHandler', () => {
  it('requires real Pi foundation env for default service startup', () => {
    expect(() => createPiExampleGatewayService()).toThrow('OPENROUTER_API_KEY');
  });

  it('serves AG-UI connect events for the Pi example agent', async () => {
    const { service, connect } = createStubService();
    const handler = createPiExampleAgUiHandler({
      agentId: 'agent-pi-example',
      service,
    });

    const response = await handler(
      new Request('http://localhost/ag-ui/agent/agent-pi-example/connect', {
        method: 'POST',
        body: JSON.stringify({ threadId: 'thread-1' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(connect).toHaveBeenCalledWith({ threadId: 'thread-1' });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    await expect(response.text()).resolves.toContain('"type":"STATE_SNAPSHOT"');
  });

  it('serves AG-UI run and stop events for the Pi example agent', async () => {
    const { service, run, stop } = createStubService();
    const handler = createPiExampleAgUiHandler({
      agentId: 'agent-pi-example',
      service,
    });

    const runResponse = await handler(
      new Request('http://localhost/ag-ui/agent/agent-pi-example/run', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          runId: 'run-1',
          messages: [{ id: 'msg-1', role: 'user', content: 'hi' }],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const stopResponse = await handler(
      new Request('http://localhost/ag-ui/agent/agent-pi-example/stop', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          runId: 'run-1',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(run).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-1',
      messages: [{ id: 'msg-1', role: 'user', content: 'hi' }],
    });
    expect(stop).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-1',
    });
    await expect(runResponse.text()).resolves.toContain('"status":"completed"');
    await expect(stopResponse.text()).resolves.toContain('"status":"aborted"');
  });

  it('serves control-plane reads for the Pi example agent', async () => {
    const { service } = createStubService();
    const handler = createPiExampleAgUiHandler({
      agentId: 'agent-pi-example',
      service,
    });

    const response = await handler(new Request('http://localhost/ag-ui/control/threads'));

    await expect(response.text()).resolves.toContain('"threadId":"thread-1"');
  });

  it('persists direct execution state and loads operator control-plane reads through persistence hooks', async () => {
    const ensureReady = vi.fn(async () => undefined);
    const persistDirectExecution = vi.fn(async () => undefined);
    const loadInspectionState = vi.fn(async () => ({
      threads: [
        {
          threadId: 'thread-1',
          threadKey: 'thread-1',
          status: 'active',
          threadState: { threadId: 'thread-1' },
          createdAt: new Date('2026-03-20T00:00:00.000Z'),
          updatedAt: new Date('2026-03-20T00:01:00.000Z'),
        },
      ],
      executions: [
        {
          executionId: 'pi-example:thread-1',
          threadId: 'thread-1',
          automationRunId: null,
          status: 'working',
          source: 'user',
          currentInterruptId: 'interrupt-1',
          createdAt: new Date('2026-03-20T00:02:00.000Z'),
          updatedAt: new Date('2026-03-20T00:03:00.000Z'),
          completedAt: null,
        },
      ],
      automations: [],
      automationRuns: [],
      interrupts: [
        {
          interruptId: 'interrupt-1',
          executionId: 'pi-example:thread-1',
          threadId: 'thread-1',
          status: 'pending',
          surfacedInThread: true,
        },
      ],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    }));

    const service = createPiExampleGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
      },
      persistence: {
        ensureReady,
        persistDirectExecution,
        loadInspectionState,
      },
    });

    await service.connect({ threadId: 'thread-1' });
    const threads = await service.control.listThreads();
    const maintenance = await service.control.inspectMaintenance();

    expect(ensureReady).toHaveBeenCalled();
    expect(persistDirectExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        threadKey: 'thread-1',
        threadId: expect.stringMatching(STABLE_UUID_PATTERN),
        executionId: expect.stringMatching(STABLE_UUID_PATTERN),
        interruptId: expect.stringMatching(STABLE_UUID_PATTERN),
        artifactId: expect.stringMatching(STABLE_UUID_PATTERN),
        activityId: expect.stringMatching(UUID_PATTERN),
      }),
    );
    expect(threads).toEqual([
      expect.objectContaining({
        threadId: 'thread-1',
      }),
    ]);
    expect(maintenance).toMatchObject({
      recovery: {
        interruptIdsToResurface: ['interrupt-1'],
      },
    });
  });

  it('surfaces runtime-state automation artifacts after a mocked tool-backed run', async () => {
    const service = createPiExampleGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
      },
      persistence: {
        ensureReady: async () => undefined,
        persistDirectExecution: async () => undefined,
        scheduleAutomation: async () => ({
          automationId: 'automation-1',
          runId: 'run-1',
          executionId: 'exec-1',
          artifactId: 'artifact-1',
        }),
        requestInterrupt: async () => ({
          artifactId: 'interrupt-artifact-1',
        }),
        loadInspectionState: async () => ({
          threads: [],
          executions: [],
          automations: [],
          automationRuns: [],
          interrupts: [],
          leases: [],
          outboxIntents: [],
          executionEvents: [],
          threadActivities: [],
        }),
      },
    });

    const runEvents = await collectEventSource(
      await service.run({
        threadId: 'thread-1',
        runId: 'run-schedule',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'Please schedule sync automation.',
          },
        ],
      }),
    );

    expect(runEvents).toContainEqual(
      expect.objectContaining({
        type: 'STATE_SNAPSHOT',
        snapshot: expect.objectContaining({
          thread: expect.objectContaining({
            artifacts: expect.objectContaining({
              current: expect.objectContaining({
                data: expect.objectContaining({
                  type: 'automation-status',
                  status: 'scheduled',
                  command: 'sync',
                }),
              }),
            }),
            activity: expect.objectContaining({
              events: expect.arrayContaining([
                expect.objectContaining({
                  parts: expect.arrayContaining([
                    expect.objectContaining({
                      kind: 'a2ui',
                    }),
                  ]),
                }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it('replays transcript messages from Pi-owned runtime state on reconnect after a mocked run', async () => {
    const service = createPiExampleGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
      },
      persistence: {
        ensureReady: async () => undefined,
        persistDirectExecution: async () => undefined,
        loadInspectionState: async () => ({
          threads: [],
          executions: [],
          automations: [],
          automationRuns: [],
          interrupts: [],
          leases: [],
          outboxIntents: [],
          executionEvents: [],
          threadActivities: [],
        }),
      },
    });

    await collectEventSource(
      await service.run({
        threadId: 'thread-1',
        runId: 'run-transcript',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'What can you do?',
          },
        ],
      }),
    );

    const connectSource = await service.connect({
      threadId: 'thread-1',
    });
    expect(Array.isArray(connectSource)).toBe(false);
    const iterator = (connectSource as AsyncIterable<unknown>)[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        done: false,
        value: expect.objectContaining({
          type: 'RUN_STARTED',
        }),
      }),
    );
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        done: false,
        value: expect.objectContaining({
          type: 'STATE_SNAPSHOT',
        }),
      }),
    );
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({
        done: false,
        value: expect.objectContaining({
          type: 'MESSAGES_SNAPSHOT',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'What can you do?',
            }),
            expect.objectContaining({
              role: 'assistant',
            }),
          ]),
        }),
      }),
    );
  });

  it('keeps connect attached and emits a later background automation execution as a synthetic AG-UI run', async () => {
    vi.useFakeTimers();

    try {
      const runtimeState = createPiExampleRuntimeStateStore();
      const service = createPiExampleGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
          PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
        },
        runtimeState,
        persistence: {
          ensureReady: async () => undefined,
          persistDirectExecution: async () => undefined,
          loadInspectionState: async () => ({
            threads: [],
            executions: [],
            automations: [],
            automationRuns: [],
            interrupts: [],
            leases: [],
            outboxIntents: [],
            executionEvents: [],
            threadActivities: [],
          }),
        },
      });

      const connectSource = await service.connect({ threadId: 'thread-1' });
      expect(Array.isArray(connectSource)).toBe(false);
      const iterator = (connectSource as AsyncIterable<unknown>)[Symbol.asyncIterator]();

      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: {
          type: 'RUN_STARTED',
          threadId: 'thread-1',
          runId: 'connect:thread-1',
        },
      });
      await expect(iterator.next()).resolves.toEqual(
        expect.objectContaining({
          done: false,
          value: expect.objectContaining({
            type: 'STATE_SNAPSHOT',
          }),
        }),
      );
      await expect(iterator.next()).resolves.toEqual(
        expect.objectContaining({
          done: false,
          value: expect.objectContaining({
            type: 'MESSAGES_SNAPSHOT',
          }),
        }),
      );
      await expect(iterator.next()).resolves.toEqual(
        expect.objectContaining({
          done: false,
          value: expect.objectContaining({
            type: 'RUN_FINISHED',
            threadId: 'thread-1',
            runId: 'connect:thread-1',
          }),
        }),
      );

      const nextEvent = iterator.next();

      applyAutomationStatusUpdate({
        runtimeState,
        threadKey: 'thread-1',
        artifactId: 'artifact-1',
        automationId: 'automation-1',
        executionId: 'exec-automation-1',
        activityRunId: 'run-automation-1',
        status: 'completed',
        command: 'sync',
        minutes: 1,
        detail: 'Automation sync executed successfully.',
        emitConnectUpdate: true,
      });

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(nextEvent).resolves.toEqual({
        done: false,
        value: {
          type: 'RUN_STARTED',
          threadId: 'thread-1',
          runId: 'run-automation-1',
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces canonical automation, scheduler, outbox, and maintenance state for operator validation', async () => {
    const persistedInspectionState = {
      threads: [
        {
          threadId: 'thread-1',
          threadKey: 'thread-1',
          status: 'active',
          threadState: { threadId: 'thread-1' },
          createdAt: new Date('2026-03-20T00:00:00.000Z'),
          updatedAt: new Date('2026-03-20T00:00:00.000Z'),
        },
      ],
      executions: [
        {
          executionId: 'pi-example:thread-1',
          threadId: 'thread-1',
          automationRunId: null,
          status: 'working',
          source: 'user' as const,
          currentInterruptId: null,
          createdAt: new Date('2026-03-20T00:00:00.000Z'),
          updatedAt: new Date('2026-03-20T00:00:00.000Z'),
          completedAt: null,
        },
        {
          executionId: 'exec-automation-1',
          threadId: 'thread-1',
          automationRunId: 'run-1',
          status: 'queued' as const,
          source: 'automation' as const,
          currentInterruptId: 'interrupt-1',
          createdAt: new Date('2026-03-19T23:58:00.000Z'),
          updatedAt: new Date('2026-03-19T23:59:00.000Z'),
          completedAt: null,
        },
        {
          executionId: 'exec-completed-1',
          threadId: 'thread-1',
          automationRunId: null,
          status: 'completed' as const,
          source: 'system' as const,
          currentInterruptId: null,
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
          updatedAt: new Date('2026-03-11T00:00:00.000Z'),
          completedAt: new Date('2026-03-11T00:00:00.000Z'),
        },
      ],
      automations: [
        {
          automationId: 'automation-1',
          threadId: 'thread-1',
          commandName: 'sync',
          cadence: '0 * * * *',
          schedulePayload: { command: 'sync' },
          suspended: false,
          nextRunAt: new Date('2026-03-19T23:55:00.000Z'),
          createdAt: new Date('2026-03-19T00:00:00.000Z'),
          updatedAt: new Date('2026-03-19T23:55:00.000Z'),
        },
      ],
      automationRuns: [
        {
          runId: 'run-1',
          automationId: 'automation-1',
          threadId: 'thread-1',
          executionId: 'exec-automation-1',
          status: 'scheduled' as const,
          scheduledAt: new Date('2026-03-19T23:55:00.000Z'),
          startedAt: null,
          completedAt: null,
        },
        {
          runId: 'run-completed-1',
          automationId: 'automation-1',
          threadId: 'thread-1',
          executionId: 'exec-completed-1',
          status: 'completed' as const,
          scheduledAt: new Date('2026-03-10T00:00:00.000Z'),
          startedAt: new Date('2026-03-10T00:01:00.000Z'),
          completedAt: new Date('2026-03-10T00:10:00.000Z'),
        },
      ],
      interrupts: [
        {
          interruptId: 'interrupt-1',
          executionId: 'exec-automation-1',
          threadId: 'thread-1',
          status: 'pending' as const,
          surfacedInThread: true,
        },
      ],
      leases: [
        {
          automationId: 'automation-1',
          ownerId: 'worker-a',
          leaseExpiresAt: new Date('2026-03-19T23:56:00.000Z'),
          lastHeartbeatAt: new Date('2026-03-19T23:55:30.000Z'),
        },
      ],
      outboxIntents: [
        {
          outboxId: 'outbox-1',
          status: 'pending' as const,
          availableAt: new Date('2026-03-19T23:57:00.000Z'),
          deliveredAt: null,
        },
      ],
      executionEvents: [
        {
          eventId: 'event-archive-1',
          executionId: 'exec-completed-1',
          threadId: 'thread-1',
          eventKind: 'completed',
          createdAt: new Date('2026-03-10T00:20:00.000Z'),
        },
      ],
      threadActivities: [
        {
          activityId: 'activity-archive-1',
          threadId: 'thread-1',
          executionId: 'exec-completed-1',
          activityKind: 'summary',
          createdAt: new Date('2026-03-10T00:30:00.000Z'),
        },
      ],
    };

    const handler = createPiExampleAgUiHandler({
      agentId: 'agent-pi-example',
      service: createPiExampleGatewayService({
        env: {
          OPENROUTER_API_KEY: 'test-openrouter-key',
        },
        persistence: {
          ensureReady: async () => undefined,
          persistDirectExecution: async () => undefined,
          loadInspectionState: async () => persistedInspectionState,
        },
      }),
    });

    const automationsResponse = await handler(new Request('http://localhost/ag-ui/control/automations'));
    const automationRunsResponse = await handler(new Request('http://localhost/ag-ui/control/automation-runs'));
    const schedulerResponse = await handler(new Request('http://localhost/ag-ui/control/scheduler'));
    const outboxResponse = await handler(new Request('http://localhost/ag-ui/control/outbox'));
    const maintenanceResponse = await handler(new Request('http://localhost/ag-ui/control/maintenance'));
    const automationsBody = await automationsResponse.text();
    const automationRunsBody = await automationRunsResponse.text();
    const schedulerBody = await schedulerResponse.text();
    const outboxBody = await outboxResponse.text();
    const maintenanceBody = await maintenanceResponse.text();

    expect(automationsBody).toContain('"automationId":"automation-1"');
    expect(automationRunsBody).toContain('"runId":"run-1"');
    expect(schedulerBody).toContain('"dueAutomationIds":["automation-1"]');
    expect(outboxBody).toContain('"dueOutboxIds":["outbox-1"]');
    expect(maintenanceBody).toContain('"automationIdsToResume":["automation-1"]');
    expect(maintenanceBody).toContain('"executionIdsToResume":["pi-example:thread-1","exec-automation-1"]');
    expect(maintenanceBody).toContain('"interruptIdsToResurface":["interrupt-1"]');
    expect(maintenanceBody).toContain('"outboxIdsToReplay":["outbox-1"]');
    expect(maintenanceBody).toContain('"executionIds":["exec-completed-1"]');
    expect(maintenanceBody).toContain('"automationRunIds":["run-completed-1"]');
    expect(maintenanceBody).toContain('"executionEventIds":["event-archive-1"]');
    expect(maintenanceBody).toContain('"threadActivityIds":["activity-archive-1"]');
  });
});
