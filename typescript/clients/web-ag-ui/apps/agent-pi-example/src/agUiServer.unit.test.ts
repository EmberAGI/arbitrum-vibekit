import { describe, expect, it, vi } from 'vitest';

import type { AgentRuntimeService } from 'agent-runtime';

import { createPiExampleAgUiHandler, createPiExampleGatewayService } from './agUiServer';

function createInternalPostgresHooks() {
  return {
    ensureReady: vi.fn(async () => ({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
    })),
    loadInspectionState: vi.fn(async () => ({
      threads: [],
      executions: [],
      automations: [],
      automationRuns: [],
      interrupts: [],
      leases: [],
      outboxIntents: [],
      executionEvents: [],
      threadActivities: [],
    })),
    executeStatements: vi.fn(async () => undefined),
    persistDirectExecution: vi.fn(async () => undefined),
  };
}

function createStubService() {
  const service: AgentRuntimeService = {
    connect: async () => [{ type: 'STATE_SNAPSHOT', snapshot: { thread: { id: 'thread-1' } } }] as any[],
    run: async () =>
      [
        {
          type: 'RUN_FINISHED',
          threadId: 'thread-1',
          runId: 'run-1',
          result: { status: 'completed' },
        },
      ] as any[],
    stop: async () =>
      [
        {
          type: 'RUN_FINISHED',
          threadId: 'thread-1',
          runId: 'run-1',
          result: { status: 'aborted' },
        },
      ] as any[],
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
    createAgUiHandler: ({ agentId, basePath = '/ag-ui' }) => async (request: Request) => {
      const pathname = new URL(request.url).pathname;

      if (pathname === `${basePath}/control/threads`) {
        return new Response(JSON.stringify(await service.control.listThreads()));
      }

      if (pathname === `${basePath}/agent/${agentId}/connect`) {
        const body = await request.json() as { threadId: string };
        return new Response(JSON.stringify(await service.connect({ threadId: body.threadId })));
      }

      if (pathname === `${basePath}/agent/${agentId}/run`) {
        const body = await request.json() as {
          threadId: string;
          runId: string;
          messages?: unknown[];
        };
        return new Response(
          JSON.stringify(
            await service.run({
              threadId: body.threadId,
              runId: body.runId,
              messages: body.messages as Parameters<AgentRuntimeService['run']>[0]['messages'],
            }),
          ),
        );
      }

      const body = await request.json() as { threadId: string; runId: string };
      return new Response(
        JSON.stringify(
          await service.stop({
            threadId: body.threadId,
            runId: body.runId,
          }),
        ),
      );
    },
  };

  return { service };
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
  it('requires real Pi foundation env for default service startup', async () => {
    await expect(createPiExampleGatewayService()).rejects.toThrow('OPENROUTER_API_KEY');
  });

  it('serves AG-UI connect, run, stop, and control reads for the Pi example agent', async () => {
    const { service } = createStubService();
    const handler = createPiExampleAgUiHandler({
      agentId: 'agent-pi-example',
      service,
    });

    const connectResponse = await handler(
      new Request('http://localhost/ag-ui/agent/agent-pi-example/connect', {
        method: 'POST',
        body: JSON.stringify({ threadId: 'thread-1' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
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
    const controlResponse = await handler(new Request('http://localhost/ag-ui/control/threads'));

    await expect(connectResponse.text()).resolves.toContain('"type":"STATE_SNAPSHOT"');
    await expect(runResponse.text()).resolves.toContain('"status":"completed"');
    await expect(stopResponse.text()).resolves.toContain('"status":"aborted"');
    await expect(controlResponse.text()).resolves.toContain('"threadId":"thread-1"');
  });

  it('surfaces runtime-owned automation artifacts after a mocked tool-backed run', async () => {
    const service = await createPiExampleGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
      },
      __internalPostgres: createInternalPostgresHooks(),
    } as any);

    const runEvents = await collectEventSource(
      await service.run({
        threadId: 'thread-1',
        runId: 'run-1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'schedule a sync',
          },
        ],
      }),
    );

    expect(runEvents).toContainEqual(
      expect.objectContaining({
        type: 'RUN_FINISHED',
        result: expect.objectContaining({
          status: 'queued',
        }),
      }),
    );

    const stateDelta = runEvents.find(
      (event) =>
        typeof event === 'object' &&
        event !== null &&
        'type' in event &&
        event.type === 'STATE_DELTA' &&
        Array.isArray((event as { delta?: unknown[] }).delta),
    ) as
      | {
          delta?: Array<{
            op?: string;
            path?: string;
            value?: {
              current?: {
                data?: { type?: string; status?: string };
              };
            };
          }>;
        }
      | undefined;

    const artifactsDelta = stateDelta?.delta?.find(
      (operation) =>
        operation.op === 'add' &&
        operation.path === '/thread/artifacts',
    );

    expect(artifactsDelta?.value?.current?.data).toMatchObject({
      type: 'automation-status',
      status: 'scheduled',
    });
  });
});
