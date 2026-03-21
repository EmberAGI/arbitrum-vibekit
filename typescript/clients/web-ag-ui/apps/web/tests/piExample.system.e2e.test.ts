import crypto from 'node:crypto';

import type { AgentSubscriber, State } from '@ag-ui/client';
import { ProxiedCopilotRuntimeAgent } from '@copilotkitnext/core';
import { describe, expect, it } from 'vitest';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function isStateWithView(value: unknown): value is State {
  return typeof value === 'object' && value !== null && 'view' in value;
}

function createRuntimeAgent(params: {
  webBaseUrl: string;
  agentId: string;
  threadId: string;
}): ProxiedCopilotRuntimeAgent {
  return new ProxiedCopilotRuntimeAgent({
    runtimeUrl: `${params.webBaseUrl}/api/copilotkit`,
    transport: 'single',
    agentId: params.agentId,
    threadId: params.threadId,
  });
}

describe('Pi example AG-UI system (web + runtime + control plane)', () => {
  it('runs through /api/copilotkit and exposes maintenance recovery state', async () => {
    const webBaseUrl = requireEnv('WEB_E2E_BASE_URL');
    const piRuntimeUrl = requireEnv('PI_AGENT_DEPLOYMENT_URL');
    const threadId = crypto.randomUUID();

    const runAgent = createRuntimeAgent({
      webBaseUrl,
      agentId: 'agent-pi-example',
      threadId,
    });

    let sawRunFinished = false;
    let runErrorMessage: string | null = null;

    const runSubscriber: AgentSubscriber = {
      onRunInitialized: ({ state }) => void isStateWithView(state),
      onStateSnapshotEvent: ({ event }) => void isStateWithView(event.snapshot),
      onRunFinishedEvent: () => {
        sawRunFinished = true;
      },
      onRunErrorEvent: ({ event }) => {
        runErrorMessage = event.message;
      },
      onRunFailed: ({ error }) => {
        runErrorMessage = error.message;
      },
    };

    runAgent.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: JSON.stringify({ command: 'sync' }),
    });

    const runResult = await runAgent.runAgent(undefined, runSubscriber);
    const schedulerResponse = await fetch(`${piRuntimeUrl}/control/scheduler`);
    const maintenanceResponse = await fetch(`${piRuntimeUrl}/control/maintenance`);
    const schedulerBody = await schedulerResponse.text();
    const maintenanceBody = await maintenanceResponse.text();

    expect(runErrorMessage).toBeNull();
    expect(sawRunFinished).toBe(true);
    expect(Array.isArray(runResult.newMessages)).toBe(true);
    expect(schedulerResponse.ok).toBe(true);
    expect(maintenanceResponse.ok).toBe(true);
    expect(schedulerBody).toContain('"dueAutomationIds":["automation-1"]');
    expect(maintenanceBody).toContain(`"executionIdsToResume":["pi-example:${threadId}"]`);
    expect(maintenanceBody).toContain('"automationIdsToResume":["automation-1"]');
    expect(maintenanceBody).toContain('"interruptIdsToResurface":["interrupt-1"]');
    expect(maintenanceBody).toContain('"outboxIdsToReplay":["outbox-1"]');
  });
});
