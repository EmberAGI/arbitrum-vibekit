import type { AgentSubscriber } from '@ag-ui/client';
import type { AgentState } from '../types/agent';
import { cleanupAgentConnection } from '../utils/agentConnectionCleanup';
import { projectAgentListUpdate } from './agentListProjection';
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

function isAgentState(value: unknown): value is AgentState {
  if (typeof value !== 'object' || value === null) return false;
  return 'view' in value;
}

export function resolveAgentListPollIntervalMs(rawValue: string | undefined): number {
  const parsed = Number(rawValue ?? 15_000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
}

export function selectAgentIdsForPolling(params: {
  agentIds: string[];
  agents: Record<string, AgentListEntry>;
  activeAgentId: string | null;
}): string[] {
  return params.agentIds.filter((agentId) => !(params.activeAgentId && params.activeAgentId === agentId));
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
      if (isAgentState(state)) {
        settle({
          synced: true,
          ...projectAgentListUpdate({
            command: state.view.command,
            profile: state.view.profile,
            metrics: state.view.metrics,
            task: state.view.task,
            haltReason: state.view.haltReason,
            executionError: state.view.executionError,
          }),
        });
      }
    },
    onStateSnapshotEvent: ({ event }) => {
      const snapshot = event.snapshot;
      if (isAgentState(snapshot)) {
        settle({
          synced: true,
          ...projectAgentListUpdate({
            command: snapshot.view.command,
            profile: snapshot.view.profile,
            metrics: snapshot.view.metrics,
            task: snapshot.view.task,
            haltReason: snapshot.view.haltReason,
            executionError: snapshot.view.executionError,
          }),
        });
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
