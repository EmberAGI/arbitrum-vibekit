import type { AgentSubscriber } from '@ag-ui/client';
import { cleanupAgentConnection } from '../utils/agentConnectionCleanup';
import {
  projectAgentListUpdateFromState,
  projectDetailStateFromPayload,
} from './agentProjection';
import type { AgentListEntry } from './agentListTypes';

type RuntimeSubscription = {
  unsubscribe: () => void;
};

export type AgentListPollingRuntimeAgent = {
  subscribe: (subscriber: AgentSubscriber) => RuntimeSubscription;
  connectAgent: () => Promise<unknown>;
  detachActiveRun?: () => Promise<void> | void;
};

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

export function selectAgentIdsForPolling(params: {
  agentIds: string[];
  agents: Record<string, AgentListEntry>;
  activeAgentId: string | null;
}): string[] {
  return params.agentIds.filter((agentId) => !(params.activeAgentId && params.activeAgentId === agentId));
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
  createRuntimeAgent: PollRuntimeAgentFactory;
}): Promise<Partial<AgentListEntry> | null> {
  const runtimeAgent = params.createRuntimeAgent({
    agentId: params.agentId,
    threadId: params.threadId,
  });

  let settled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let resolvePoll: ((value: Partial<AgentListEntry> | null) => void) | undefined;

  const settle = (value: Partial<AgentListEntry> | null) => {
    if (settled) return;
    settled = true;
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
    resolvePoll?.(value);
  };

  const subscriber: AgentSubscriber = {
    onRunInitialized: ({ state }) => {
      const projectedState = projectDetailStateFromPayload(state);
      if (projectedState) {
        settle(projectAgentListUpdateFromState(projectedState));
      }
    },
    onStateSnapshotEvent: ({ event }) => {
      const snapshot = event.snapshot;
      const projectedState = projectDetailStateFromPayload(snapshot);
      if (projectedState) {
        settle(projectAgentListUpdateFromState(projectedState));
      }
    },
    onRunErrorEvent: () => settle(null),
    onRunFailed: () => settle(null),
  };
  const subscription = runtimeAgent.subscribe(subscriber);

  const resultPromise = new Promise<Partial<AgentListEntry> | null>((resolve) => {
    resolvePoll = resolve;
    timeoutHandle = setTimeout(() => settle(null), params.timeoutMs);
  });

  void runtimeAgent.connectAgent().catch(() => settle(null));

  const result = await resultPromise;
  await cleanupAgentConnection(runtimeAgent);
  subscription.unsubscribe();
  return result;
}
