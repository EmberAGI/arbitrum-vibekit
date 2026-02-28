import type { AgentSubscriber } from '@ag-ui/client';
import { v7 as uuidv7 } from 'uuid';
import { cleanupAgentConnection } from '../utils/agentConnectionCleanup';
import { isBusyRunError } from '../utils/runConcurrency';
import {
  projectAgentListUpdateFromState,
  projectDetailStateFromPayload,
} from './agentProjection';
import type { AgentListEntry } from './agentListTypes';

type RuntimeSubscription = {
  unsubscribe: () => void;
};

type CommandMessage = {
  id: string;
  role: 'user';
  content: string;
};

export type AgentListPollingRuntimeAgent = {
  subscribe: (subscriber: AgentSubscriber) => RuntimeSubscription;
  addMessage: (message: CommandMessage) => void;
  runAgent: () => Promise<unknown>;
  detachActiveRun?: () => Promise<void> | void;
};

export type AgentListPollOutcome = {
  update: Partial<AgentListEntry> | null;
  busy: boolean;
};

const DEFAULT_RUN_COMPLETION_GRACE_MS = 1_000;

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

type PollRuntimeAgentFactory = (params: {
  agentId: string;
  threadId: string;
}) => AgentListPollingRuntimeAgent;

export function resolveAgentListPollIntervalMs(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? 15_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

export function resolveAgentListPollMaxConcurrent(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? 2);
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : 2;
  return normalized > 0 ? normalized : 2;
}

export function resolveAgentListPollBusyCooldownMs(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? 30_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}

export function selectAgentIdsForPolling(params: {
  agentIds: string[];
  agents: Record<string, AgentListEntry>;
  activeAgentId: string | null;
  busyUntilByAgent?: Record<string, number>;
  nowMs?: number;
}): string[] {
  const nowMs = params.nowMs ?? Date.now();
  return params.agentIds.filter((agentId) => {
    if (params.activeAgentId && params.activeAgentId === agentId) {
      return false;
    }
    const busyUntil = params.busyUntilByAgent?.[agentId];
    if (typeof busyUntil === 'number' && busyUntil > nowMs) {
      return false;
    }
    return true;
  });
}

export async function pollAgentIdsWithConcurrency(params: {
  agentIds: string[];
  maxConcurrent: number;
  pollAgent: (agentId: string) => Promise<void>;
}): Promise<void> {
  if (params.agentIds.length === 0) return;

  const maxConcurrent = Math.max(1, Math.floor(params.maxConcurrent));
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < params.agentIds.length) {
      const agentId = params.agentIds[nextIndex];
      nextIndex += 1;
      await params.pollAgent(agentId);
    }
  };

  const workers = Array.from(
    { length: Math.min(maxConcurrent, params.agentIds.length) },
    () => worker(),
  );

  await Promise.all(workers);
}

export async function pollAgentListUpdateViaAgUi(params: {
  agentId: string;
  threadId: string;
  timeoutMs: number;
  runCompletionTimeoutMs?: number;
  createRuntimeAgent: PollRuntimeAgentFactory;
}): Promise<AgentListPollOutcome> {
  const runtimeAgent = params.createRuntimeAgent({
    agentId: params.agentId,
    threadId: params.threadId,
  });

  let settled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let runCompletionTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let resolvePoll: ((value: Partial<AgentListEntry> | null) => void) | undefined;
  let pollBusy = false;
  const runCompletionTimeoutMs = params.runCompletionTimeoutMs ?? DEFAULT_RUN_COMPLETION_GRACE_MS;
  let runCompleted = false;
  let latestProjectedUpdate: Partial<AgentListEntry> | null = null;

  const settle = (value: Partial<AgentListEntry> | null) => {
    if (settled) return;
    settled = true;
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    resolvePoll?.(value);
  };

  const captureProjectedUpdate = (statePayload: unknown) => {
    const projectedState = projectDetailStateFromPayload(statePayload);
    if (!projectedState) {
      return;
    }
    latestProjectedUpdate = projectAgentListUpdateFromState(projectedState);
    settle(latestProjectedUpdate);
  };

  const subscriber: AgentSubscriber = {
    onRunInitialized: ({ state }) => {
      captureProjectedUpdate(state);
    },
    onStateSnapshotEvent: ({ event }) => {
      captureProjectedUpdate(event.snapshot);
    },
    onRunErrorEvent: (payload) => {
      const message = payload.event.message;
      if (typeof message === 'string' && message.length > 0) {
        pollBusy = pollBusy || isBusyRunError(new Error(message));
      }
      settle(null);
    },
    onRunFailed: (payload) => {
      pollBusy = pollBusy || isBusyRunError(payload.error);
      settle(null);
    },
  };
  const subscription = runtimeAgent.subscribe(subscriber);

  const resultPromise = new Promise<Partial<AgentListEntry> | null>((resolve) => {
    resolvePoll = resolve;
    timeoutHandle = setTimeout(() => settle(null), params.timeoutMs);
  });

  const waitForRunCompletion = new Promise<boolean>((resolve) => {
    runCompletionTimeoutHandle = setTimeout(() => resolve(false), runCompletionTimeoutMs);
  });

  try {
    const clientMutationId = uuidv7();
    runtimeAgent.addMessage({
      id: uuidv7(),
      role: 'user',
      content: JSON.stringify({
        command: 'sync',
        source: 'agent-list-poll',
        clientMutationId,
      }),
    });
  } catch {
    settle(null);
  }

  const runPromise = Promise.resolve(runtimeAgent.runAgent())
    .then(() => {
      runCompleted = true;
      return true;
    })
    .catch((error) => {
      runCompleted = true;
      pollBusy = isBusyRunError(error);
      console.warn('[agent-list-poll] Poll run rejected', {
        source: 'agent-list-poll',
        agentId: params.agentId,
        threadId: params.threadId,
        busy: pollBusy,
        detail: describeError(error),
      });
      settle(null);
      return true;
    });

  const result = await resultPromise;
  const runTerminated = runCompleted ? true : await Promise.race([runPromise, waitForRunCompletion]);
  if (runCompletionTimeoutHandle !== undefined) {
    clearTimeout(runCompletionTimeoutHandle);
  }
  if (!runTerminated) {
    pollBusy = true;
    console.warn('[agent-list-poll] Poll run did not terminate before completion timeout', {
      source: 'agent-list-poll',
      agentId: params.agentId,
      threadId: params.threadId,
      runCompletionTimeoutMs,
    });
  }
  await cleanupAgentConnection(runtimeAgent);
  subscription.unsubscribe();
  return { update: latestProjectedUpdate ?? result, busy: pollBusy };
}
