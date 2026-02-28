import {
  defaultActivity,
  defaultMetrics,
  defaultProfile,
  defaultSettings,
  defaultThreadState,
  initialAgentState,
  type ThreadSnapshot,
  type ThreadState,
} from '../types/agent';
import type { AgentListEntry } from './agentListTypes';
import { projectAgentListUpdate } from './agentListProjection';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneInitialState(): ThreadSnapshot {
  return {
    ...initialAgentState,
    messages: [],
    copilotkit: { actions: [], context: [] },
    settings: { ...defaultSettings },
    thread: {
      ...defaultThreadState,
      profile: {
        ...defaultProfile,
        chains: [],
        protocols: [],
        tokens: [],
        pools: [],
        allowedPools: [],
      },
      activity: {
        ...defaultActivity,
        telemetry: [],
        events: [],
      },
      metrics: {
        ...defaultMetrics,
      },
      transactionHistory: [],
    },
  };
}

function mergeStatePayload(projected: ThreadSnapshot, incoming: Partial<ThreadSnapshot>): ThreadSnapshot {
  type IncomingThreadEnvelope = Partial<ThreadSnapshot> & {
    thread?: Partial<ThreadState>;
  };
  const incomingEnvelope = incoming as IncomingThreadEnvelope;
  const incomingThreadRaw = isRecord(incomingEnvelope.thread) ? incomingEnvelope.thread : {};
  const { command: _droppedCommand, ...incomingThread } = incomingThreadRaw as Partial<ThreadState> & {
    command?: unknown;
  };
  const incomingProfile = isRecord(incomingThread.profile)
    ? incomingThread.profile
    : ({} as Partial<ThreadState['profile']>);
  const incomingActivity = isRecord(incomingThread.activity)
    ? incomingThread.activity
    : ({} as Partial<ThreadState['activity']>);
  const incomingMetrics = isRecord(incomingThread.metrics)
    ? incomingThread.metrics
    : ({} as Partial<ThreadState['metrics']>);

  projected.messages = Array.isArray(incoming.messages) ? incoming.messages : projected.messages;

  if (isRecord(incoming.copilotkit)) {
    projected.copilotkit = {
      actions: Array.isArray(incoming.copilotkit.actions) ? incoming.copilotkit.actions : [],
      context: Array.isArray(incoming.copilotkit.context) ? incoming.copilotkit.context : [],
    };
  }

  if (isRecord(incoming.settings)) {
    projected.settings = {
      ...projected.settings,
      ...incoming.settings,
    };
  }

  projected.thread = {
    ...projected.thread,
    ...incomingThread,
    profile: {
      ...projected.thread.profile,
      ...incomingProfile,
      chains: Array.isArray(incomingProfile.chains)
        ? incomingProfile.chains
        : projected.thread.profile.chains,
      protocols: Array.isArray(incomingProfile.protocols)
        ? incomingProfile.protocols
        : projected.thread.profile.protocols,
      tokens: Array.isArray(incomingProfile.tokens)
        ? incomingProfile.tokens
        : projected.thread.profile.tokens,
      pools: Array.isArray(incomingProfile.pools)
        ? incomingProfile.pools
        : projected.thread.profile.pools,
      allowedPools: Array.isArray(incomingProfile.allowedPools)
        ? incomingProfile.allowedPools
        : projected.thread.profile.allowedPools,
    },
    activity: {
      ...projected.thread.activity,
      ...incomingActivity,
      telemetry: Array.isArray(incomingActivity.telemetry)
        ? incomingActivity.telemetry
        : projected.thread.activity.telemetry,
      events: Array.isArray(incomingActivity.events)
        ? incomingActivity.events
        : projected.thread.activity.events,
    },
    metrics: {
      ...projected.thread.metrics,
      ...incomingMetrics,
    },
    transactionHistory: Array.isArray(incomingThread.transactionHistory)
      ? incomingThread.transactionHistory
      : projected.thread.transactionHistory,
  };
  return projected;
}

export function projectDetailStateFromPayload(
  payload: unknown,
  previousState?: ThreadSnapshot | null,
): ThreadSnapshot | null {
  if (!isRecord(payload)) return null;
  if (Object.keys(payload).length === 0) return null;

  const projected = cloneInitialState();

  if (previousState && isRecord(previousState) && Object.keys(previousState).length > 0) {
    mergeStatePayload(projected, previousState as Partial<ThreadSnapshot>);
  }

  mergeStatePayload(projected, payload as Partial<ThreadSnapshot>);
  return projected;
}

export function projectAgentListUpdateFromState(state: ThreadSnapshot): Partial<AgentListEntry> {
  return projectAgentListUpdate({
    profile: state.thread.profile,
    metrics: state.thread.metrics,
    task: state.thread.task,
    haltReason: state.thread.haltReason,
    executionError: state.thread.executionError,
  });
}
