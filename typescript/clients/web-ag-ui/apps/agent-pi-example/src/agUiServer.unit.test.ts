import type { PiRuntimeGatewayService } from 'agent-runtime';
import { describe, expect, it, vi } from 'vitest';

import { createPiExampleAgUiHandler } from './agUiServer';

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

describe('createPiExampleAgUiHandler', () => {
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
});
