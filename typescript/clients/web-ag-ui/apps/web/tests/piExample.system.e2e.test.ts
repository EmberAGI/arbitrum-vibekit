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

    const runResult = await runAgent.runAgent(
      {
        forwardedProps: {
          command: {
            name: 'refresh',
            clientMutationId: crypto.randomUUID(),
          },
        },
      },
      runSubscriber,
    );
    const threadsResponse = await fetch(`${piRuntimeUrl}/control/threads`);
    const executionsResponse = await fetch(`${piRuntimeUrl}/control/executions`);
    const schedulerResponse = await fetch(`${piRuntimeUrl}/control/scheduler`);
    const maintenanceResponse = await fetch(`${piRuntimeUrl}/control/maintenance`);
    const threadsBody = (await threadsResponse.json()) as Array<{
      threadId: string;
      threadKey: string;
      threadState: { threadId?: string };
    }>;
    const executionsBody = (await executionsResponse.json()) as Array<{
      executionId: string;
      threadId: string;
      source: string;
      currentInterruptId: string | null;
    }>;
    const schedulerBody = await schedulerResponse.text();
    const maintenanceBody = (await maintenanceResponse.json()) as {
      recovery: {
        automationIdsToResume: string[];
        executionIdsToResume: string[];
        outboxIdsToReplay: string[];
        interruptIdsToResurface: string[];
      };
    };
    const persistedThread = threadsBody.find((thread) => thread.threadKey === threadId);
    const persistedExecution = executionsBody.find((execution) => execution.threadId === persistedThread?.threadId);

    expect(runErrorMessage).toBeNull();
    expect(sawRunFinished).toBe(true);
    expect(Array.isArray(runResult.newMessages)).toBe(true);
    expect(threadsResponse.ok).toBe(true);
    expect(executionsResponse.ok).toBe(true);
    expect(schedulerResponse.ok).toBe(true);
    expect(maintenanceResponse.ok).toBe(true);
    expect(persistedThread).toMatchObject({
      threadKey: threadId,
      threadState: {
        threadId,
      },
    });
    expect(executionsBody).toContainEqual(
      expect.objectContaining({
        threadId: persistedThread?.threadId,
        source: 'user',
        currentInterruptId: expect.any(String),
      }),
    );
    expect(persistedExecution?.currentInterruptId).toEqual(expect.any(String));
    expect(schedulerBody).toContain('"dueAutomationIds":[]');
    expect(maintenanceBody.recovery.executionIdsToResume).toEqual([]);
    expect(maintenanceBody.recovery.automationIdsToResume).toEqual([]);
    expect(maintenanceBody.recovery.outboxIdsToReplay).toEqual([]);
    expect(maintenanceBody.recovery.interruptIdsToResurface).toContain(persistedExecution?.currentInterruptId ?? '');
  });
});
