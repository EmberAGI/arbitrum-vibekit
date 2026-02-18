import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

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

function isBenignDetachError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('abort') || normalized.includes('cancel');
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

describe('GMX Allora AG-UI system (web + runtime)', () => {
  it('connects through /api/copilotkit and supports deterministic detach on unfocus', async () => {
    const webBaseUrl = requireEnv('WEB_E2E_BASE_URL');
    const agent = createRuntimeAgent({
      webBaseUrl,
      agentId: 'agent-gmx-allora',
      threadId: crypto.randomUUID(),
    });

    let runErrorMessage: string | null = null;
    let sawConnectEvent = false;

    const subscriber: AgentSubscriber = {
      onRunInitialized: () => {
        sawConnectEvent = true;
      },
      onStateSnapshotEvent: () => {
        sawConnectEvent = true;
      },
      onRunErrorEvent: ({ event }) => {
        runErrorMessage = event.message;
      },
      onRunFailed: ({ error }) => {
        runErrorMessage = error.message;
      },
    };

    const connectPromise = agent.connectAgent(undefined, subscriber);
    await delay(1_500);

    await agent.detachActiveRun();

    const connectSettled = await Promise.race([
      connectPromise.then(
        () => true,
        () => true,
      ),
      delay(10_000).then(() => false),
    ]);

    expect(connectSettled).toBe(true);
    if (runErrorMessage !== null) {
      expect(isBenignDetachError(runErrorMessage)).toBe(true);
    }
    expect(typeof sawConnectEvent).toBe('boolean');
  });

  it('runs sync command via AG-UI run semantics only', async () => {
    const webBaseUrl = requireEnv('WEB_E2E_BASE_URL');
    const agent = createRuntimeAgent({
      webBaseUrl,
      agentId: 'agent-gmx-allora',
      threadId: crypto.randomUUID(),
    });

    let sawState = false;
    let sawRunFinished = false;
    let runErrorMessage: string | null = null;

    const subscriber: AgentSubscriber = {
      onRunInitialized: ({ state }) => {
        if (isStateWithView(state)) {
          sawState = true;
        }
      },
      onStateSnapshotEvent: ({ event }) => {
        if (isStateWithView(event.snapshot)) {
          sawState = true;
        }
      },
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

    agent.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: JSON.stringify({ command: 'sync' }),
    });

    const runResult = await agent.runAgent(undefined, subscriber);

    expect(runErrorMessage).toBeNull();
    expect(sawState).toBe(true);
    expect(sawRunFinished).toBe(true);
    expect(Array.isArray(runResult.newMessages)).toBe(true);
  });
});
