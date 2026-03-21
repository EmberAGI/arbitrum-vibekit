import type { PiRuntimeGatewayService } from 'agent-runtime';
import { describe, expect, it, vi } from 'vitest';

import { createPiExampleAgUiHandler, createPiExampleGatewayService } from './agUiServer';

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

  it('surfaces canonical automation, scheduler, outbox, and maintenance state for operator validation', async () => {
    const handler = createPiExampleAgUiHandler({
      agentId: 'agent-pi-example',
      service: createPiExampleGatewayService(),
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
    expect(maintenanceBody).toContain('"executionIdsToResume":["pi-example:thread-1"]');
    expect(maintenanceBody).toContain('"interruptIdsToResurface":["interrupt-1"]');
    expect(maintenanceBody).toContain('"outboxIdsToReplay":["outbox-1"]');
    expect(maintenanceBody).toContain('"executionIds":["exec-completed-1"]');
    expect(maintenanceBody).toContain('"automationRunIds":["run-completed-1"]');
    expect(maintenanceBody).toContain('"executionEventIds":["event-archive-1"]');
    expect(maintenanceBody).toContain('"threadActivityIds":["activity-archive-1"]');
  });
});
