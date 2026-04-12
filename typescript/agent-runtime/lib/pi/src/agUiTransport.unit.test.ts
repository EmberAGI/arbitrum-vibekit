import { verifyEvents } from '@ag-ui/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPiRuntimeGatewayAgUiHandler,
  type PiRuntimeGatewayService,
  PiRuntimeGatewayHttpAgent,
} from './index.js';

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
      inspectScheduler: async () => ({ dueAutomationIds: ['automation-1'], leases: [] }),
      inspectOutbox: async () => ({ dueOutboxIds: ['outbox-1'], intents: [] }),
      inspectMaintenance: async () => ({
        recovery: { automationIdsToResume: ['automation-1'] },
        archival: { executionIds: [] },
      }),
    },
  };

  return { service, connect, run, stop };
}

function createInput() {
  return {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [],
    state: {},
    tools: [],
    context: [],
    forwardedProps: {},
  };
}

function createSseResponse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream',
    },
  });
}

async function collectEvents(source$: {
  subscribe: (observer: {
    next: (value: unknown) => void;
    error: (error: unknown) => void;
    complete: () => void;
  }) => { unsubscribe: () => void };
}) {
  return await new Promise<unknown[]>((resolve, reject) => {
    const events: unknown[] = [];
    const subscription = source$.subscribe({
      next: (value) => {
        events.push(value);
      },
      error: (error) => {
        subscription.unsubscribe();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
      complete: () => {
        subscription.unsubscribe();
        resolve(events);
      },
    });
  });
}

describe('Pi AG-UI transport helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a reusable AG-UI handler for Pi runtime services', async () => {
    const { service, connect, run, stop } = createStubService();
    const handler = createPiRuntimeGatewayAgUiHandler({
      agentId: 'agent-pi-example',
      service,
      basePath: '/ag-ui',
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
    const healthResponse = await handler(new Request('http://localhost/ag-ui/control/health'));
    const threadsResponse = await handler(new Request('http://localhost/ag-ui/control/threads'));
    const automationsResponse = await handler(new Request('http://localhost/ag-ui/control/automations'));
    const automationRunsResponse = await handler(new Request('http://localhost/ag-ui/control/automation-runs'));
    const schedulerResponse = await handler(new Request('http://localhost/ag-ui/control/scheduler'));
    const outboxResponse = await handler(new Request('http://localhost/ag-ui/control/outbox'));
    const maintenanceResponse = await handler(new Request('http://localhost/ag-ui/control/maintenance'));

    expect(connect).toHaveBeenCalledWith({ threadId: 'thread-1' });
    expect(run).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-1',
      messages: [{ id: 'msg-1', role: 'user', content: 'hi' }],
    });
    expect(stop).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-1',
    });
    expect(connectResponse.headers.get('content-type')).toContain('text/event-stream');
    await expect(runResponse.text()).resolves.toContain('"status":"completed"');
    await expect(stopResponse.text()).resolves.toContain('"status":"aborted"');
    await expect(healthResponse.text()).resolves.toContain('"status":"ok"');
    await expect(threadsResponse.text()).resolves.toContain('"threadId":"thread-1"');
    await expect(automationsResponse.text()).resolves.toContain('"automationId":"automation-1"');
    await expect(automationRunsResponse.text()).resolves.toContain('"runId":"run-1"');
    await expect(schedulerResponse.text()).resolves.toContain('"dueAutomationIds":["automation-1"]');
    await expect(outboxResponse.text()).resolves.toContain('"dueOutboxIds":["outbox-1"]');
    await expect(maintenanceResponse.text()).resolves.toContain('"automationIdsToResume":["automation-1"]');
  });

  it('preserves explicit object resume commands on AG-UI run requests', async () => {
    const { service, run } = createStubService();
    const handler = createPiRuntimeGatewayAgUiHandler({
      agentId: 'agent-pi-example',
      service,
      basePath: '/ag-ui',
    });

    await handler(
      new Request('http://localhost/ag-ui/agent/agent-pi-example/run', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          runId: 'run-resume',
          forwardedProps: {
            command: {
              resume: {
                outcome: 'signed',
                signedDelegations: [
                  {
                    signature: '0x1234',
                  },
                ],
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(run).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-resume',
      forwardedProps: {
        command: {
          resume: {
            outcome: 'signed',
            signedDelegations: [
              {
                signature: '0x1234',
              },
            ],
          },
        },
      },
    });
  });

  it('preserves direct command name and input on AG-UI run requests', async () => {
    const { service, run } = createStubService();
    const handler = createPiRuntimeGatewayAgUiHandler({
      agentId: 'agent-pi-example',
      service,
      basePath: '/ag-ui',
    });

    await handler(
      new Request('http://localhost/ag-ui/agent/agent-pi-example/run', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          runId: 'run-command',
          forwardedProps: {
            command: {
              name: 'hire',
              input: {
                operator: 'ember',
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(run).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-command',
      forwardedProps: {
        command: {
          name: 'hire',
          input: {
            operator: 'ember',
          },
        },
      },
    });
  });

  it('preserves canonical shared-state update commands on AG-UI run requests', async () => {
    const { service, run } = createStubService();
    const handler = createPiRuntimeGatewayAgUiHandler({
      agentId: 'agent-pi-example',
      service,
      basePath: '/ag-ui',
    });

    await handler(
      new Request('http://localhost/ag-ui/agent/agent-pi-example/run', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          runId: 'run-update',
          forwardedProps: {
            command: {
              update: {
                clientMutationId: 'mutation-1',
                baseRevision: 'shared-rev-1',
                patch: [
                  {
                    op: 'add',
                    path: '/shared/settings/amount',
                    value: 250,
                  },
                ],
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(run).toHaveBeenCalledWith({
      threadId: 'thread-1',
      runId: 'run-update',
      forwardedProps: {
        command: {
          update: {
            clientMutationId: 'mutation-1',
            baseRevision: 'shared-rev-1',
            patch: [
              {
                op: 'add',
                path: '/shared/settings/amount',
                value: 250,
              },
            ],
          },
        },
      },
    });
  });

  it('rejects malformed shared-state update commands without a clientMutationId', async () => {
    const { service, run } = createStubService();
    const handler = createPiRuntimeGatewayAgUiHandler({
      agentId: 'agent-pi-example',
      service,
      basePath: '/ag-ui',
    });

    const response = await handler(
      new Request('http://localhost/ag-ui/agent/agent-pi-example/run', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          runId: 'run-update',
          forwardedProps: {
            command: {
              update: {
                patch: [
                  {
                    op: 'add',
                    path: '/shared/settings/amount',
                    value: 250,
                  },
                ],
              },
            },
          },
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Shared-state update commands require a non-empty clientMutationId.',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('uses HttpAgent semantics while targeting Pi connect and stop endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createSseResponse([
          {
            type: 'RUN_STARTED',
            threadId: 'thread-1',
            runId: 'run-1',
          },
          {
            type: 'STATE_SNAPSHOT',
            snapshot: {
              thread: {
                id: 'thread-1',
              },
            },
          },
          {
            type: 'RUN_FINISHED',
            threadId: 'thread-1',
            runId: 'run-1',
            result: { status: 'completed' },
          },
        ]),
      )
      .mockResolvedValueOnce(
        createSseResponse([
          {
            type: 'RUN_FINISHED',
            threadId: 'thread-1',
            runId: 'run-1',
            result: { status: 'completed' },
          },
        ]),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const agent = new PiRuntimeGatewayHttpAgent({
      agentId: 'agent-pi-example',
      runtimeUrl: 'http://pi-agent-example:3410/ag-ui',
    });

    const connectEvents = await collectEvents(agent.connect(createInput()).pipe(verifyEvents()));
    await collectEvents(agent.run(createInput()));
    agent.abortRun();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://pi-agent-example:3410/ag-ui/agent/agent-pi-example/connect',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(createInput()),
      }),
    );
    expect(connectEvents.map((event) => (event as { type: string }).type)).toEqual([
      'RUN_STARTED',
      'STATE_SNAPSHOT',
      'RUN_FINISHED',
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://pi-agent-example:3410/ag-ui/agent/agent-pi-example/stop',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          runId: 'run-1',
        }),
      }),
    );
  });
});
