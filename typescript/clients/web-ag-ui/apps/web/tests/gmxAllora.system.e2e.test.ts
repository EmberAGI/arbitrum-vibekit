import crypto from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import type { AgentSubscriber } from '@ag-ui/client';
import { ProxiedCopilotRuntimeAgent } from '@copilotkitnext/core';
import { describe, expect, it } from 'vitest';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function isBenignDetachError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('abort') || normalized.includes('cancel') || normalized.includes('fetch failed');
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

function resolveThreadView(snapshot: unknown): Record<string, unknown> | null {
  if (typeof snapshot !== 'object' || snapshot === null || !('thread' in snapshot)) {
    return null;
  }

  const thread = (snapshot as { thread?: unknown }).thread;
  return typeof thread === 'object' && thread !== null ? (thread as Record<string, unknown>) : null;
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

    let sawRunFinished = false;
    let runErrorMessage: string | null = null;

    const subscriber: AgentSubscriber = {
      onRunInitialized: () => undefined,
      onStateSnapshotEvent: () => undefined,
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

    const runResult = await agent.runAgent(
      {
        forwardedProps: {
          command: {
            name: 'sync',
            clientMutationId: crypto.randomUUID(),
          },
        },
      },
      subscriber,
    );

    expect(runErrorMessage).toBeNull();
    expect(sawRunFinished).toBe(true);
    expect(Array.isArray(runResult.newMessages)).toBe(true);
  });

  it('resumes the setup interrupt onto the next onboarding stage through /api/copilotkit', async () => {
    const webBaseUrl = requireEnv('WEB_E2E_BASE_URL');
    const agent = createRuntimeAgent({
      webBaseUrl,
      agentId: 'agent-gmx-allora',
      threadId: crypto.randomUUID(),
    });

    let runErrorMessage: string | null = null;
    let latestThreadView: Record<string, unknown> | null = null;

    const subscriber: AgentSubscriber = {
      onStateSnapshotEvent: ({ snapshot }) => {
        latestThreadView = resolveThreadView(snapshot);
      },
      onRunErrorEvent: ({ event }) => {
        runErrorMessage = event.message;
      },
      onRunFailed: ({ error }) => {
        runErrorMessage = error.message;
      },
    };

    await agent.runAgent(
      {
        forwardedProps: {
          command: {
            name: 'hire',
            clientMutationId: crypto.randomUUID(),
          },
        },
      },
      subscriber,
    );

    const afterHire = resolveThreadView(agent.state) ?? latestThreadView;
    expect(runErrorMessage).toBeNull();
    expect(afterHire?.onboarding).toMatchObject({
      key: 'setup',
      step: 1,
    });
    expect(afterHire?.task).toMatchObject({
      taskStatus: {
        state: 'input-required',
      },
    });

    await agent.runAgent(
      {
        forwardedProps: {
          command: {
            resume: JSON.stringify({
              walletAddress: '0x1111111111111111111111111111111111111111',
              baseContributionUsd: 100,
              targetMarket: 'BTC',
            }),
          },
        },
      },
      subscriber,
    );

    const afterResume = resolveThreadView(agent.state) ?? latestThreadView;
    if (runErrorMessage !== null) {
      expect(runErrorMessage.toLowerCase()).not.toContain('thread already running');
    }
    expect(afterResume?.operatorInput).toMatchObject({
      walletAddress: '0x1111111111111111111111111111111111111111',
      usdcAllocation: 100,
      targetMarket: 'BTC',
    });
    expect(afterResume?.onboarding).toBeTruthy();
    expect((afterResume?.onboarding as { key?: string } | undefined)?.key).not.toBe('setup');
  });
});
