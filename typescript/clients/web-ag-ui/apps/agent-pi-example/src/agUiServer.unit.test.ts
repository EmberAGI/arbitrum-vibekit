import type { PiRuntimeGatewayService } from 'agent-runtime';
import { describe, expect, it } from 'vitest';

import { createPiExampleAgUiHandler, createPiExampleGatewayService } from './agUiServer';

function createStubService() {
  const service: PiRuntimeGatewayService = {
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
  it('requires real Pi foundation env for default service startup', () => {
    expect(() => createPiExampleGatewayService()).toThrow('OPENROUTER_API_KEY');
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
    const service = createPiExampleGatewayService({
      env: {
        OPENROUTER_API_KEY: 'test-openrouter-key',
        PI_AGENT_EXTERNAL_BOUNDARY_MODE: 'mocked',
      },
    });

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
    const snapshot = runEvents.find(
      (event) => typeof event === 'object' && event !== null && 'snapshot' in event,
    ) as { snapshot?: { thread?: { artifacts?: { current?: { data?: { type?: string; status?: string } } } } } } | undefined;

    expect(snapshot?.snapshot?.thread?.artifacts?.current?.data).toMatchObject({
      type: 'automation-status',
      status: 'scheduled',
    });
  });
});
