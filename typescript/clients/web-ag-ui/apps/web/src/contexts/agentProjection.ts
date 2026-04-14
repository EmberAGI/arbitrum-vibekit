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

function mergeProjectedDomainProjection(
  currentValue: Record<string, unknown>,
  incomingValue: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...currentValue };

  for (const [key, nextValue] of Object.entries(incomingValue)) {
    if (Array.isArray(nextValue)) {
      merged[key] = nextValue;
      continue;
    }

    const currentNestedValue = merged[key];
    if (isRecord(currentNestedValue) && isRecord(nextValue)) {
      merged[key] = mergeProjectedDomainProjection(currentNestedValue, nextValue);
      continue;
    }

    merged[key] = nextValue;
  }

  return merged;
}

function cloneInitialState(): ThreadSnapshot {
  return {
    ...initialAgentState,
    messages: [],
    copilotkit: { actions: [], context: [] },
    settings: { ...defaultSettings },
    thread: {
      ...defaultThreadState,
      lifecycle: undefined,
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

type MergeStatePayloadMode = 'normalized-state' | 'wire-payload';

function mergeStatePayload(
  projected: ThreadSnapshot,
  incoming: Partial<ThreadSnapshot>,
  mode: MergeStatePayloadMode,
): ThreadSnapshot {
  type IncomingThreadEnvelope = Partial<ThreadSnapshot> & {
    thread?: Partial<ThreadState>;
    shared?: {
      settings?: Partial<ThreadSnapshot['settings']>;
    };
    projected?: Record<string, unknown>;
  };
  const incomingEnvelope = incoming as IncomingThreadEnvelope;
  const incomingThreadRaw = isRecord(incomingEnvelope.thread) ? incomingEnvelope.thread : {};
  const incomingSharedRaw = isRecord(incomingEnvelope.shared) ? incomingEnvelope.shared : {};
  const incomingThreadCandidate = { ...incomingThreadRaw } as Partial<ThreadState> & {
    command?: unknown;
    messages?: unknown;
    domainProjection?: unknown;
  };
  delete incomingThreadCandidate.command;
  const incomingThreadDomainProjection =
    mode === 'normalized-state' && isRecord(incomingThreadCandidate.domainProjection)
      ? incomingThreadCandidate.domainProjection
      : undefined;
  delete incomingThreadCandidate.domainProjection;
  delete incomingThreadCandidate.messages;
  const incomingThread = incomingThreadCandidate as Partial<ThreadState> & {
    profile?: Partial<ThreadState['profile']>;
    activity?: Partial<ThreadState['activity']>;
    metrics?: Partial<ThreadState['metrics']>;
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
  const incomingProjectedDomainProjection = isRecord(incomingEnvelope.projected)
    ? incomingEnvelope.projected
    : undefined;
  const incomingSharedSettings = isRecord(incomingSharedRaw.settings) ? incomingSharedRaw.settings : undefined;

  if (mode === 'normalized-state' && Array.isArray(incoming.messages)) {
    projected.messages = incoming.messages;
  }

  if (isRecord(incoming.copilotkit)) {
    projected.copilotkit = {
      actions: Array.isArray(incoming.copilotkit.actions) ? incoming.copilotkit.actions : [],
      context: Array.isArray(incoming.copilotkit.context) ? incoming.copilotkit.context : [],
    };
  }

  if (mode === 'normalized-state' && isRecord(incoming.settings)) {
    projected.settings = {
      ...projected.settings,
      ...incoming.settings,
    };
  }

  if (incomingSharedSettings) {
    projected.settings = {
      ...projected.settings,
      ...incomingSharedSettings,
    };
  }

  if (Array.isArray(incoming.tasks)) {
    projected.tasks = incoming.tasks;
  }

  const nextDomainProjectionBase = isRecord(projected.thread.domainProjection)
    ? projected.thread.domainProjection
    : {};
  const nextDomainProjectionFromThread = incomingThreadDomainProjection
    ? mergeProjectedDomainProjection(nextDomainProjectionBase, incomingThreadDomainProjection)
    : nextDomainProjectionBase;
  const nextDomainProjection = incomingProjectedDomainProjection
    ? mergeProjectedDomainProjection(nextDomainProjectionFromThread, incomingProjectedDomainProjection)
    : nextDomainProjectionFromThread;

  projected.thread = {
    ...projected.thread,
    ...incomingThread,
    ...(incomingThreadDomainProjection || incomingProjectedDomainProjection
      ? {
          domainProjection: nextDomainProjection,
        }
      : {}),
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
    mergeStatePayload(projected, previousState as Partial<ThreadSnapshot>, 'normalized-state');
  }

  mergeStatePayload(projected, payload as Partial<ThreadSnapshot>, 'wire-payload');
  return projected;
}

export function projectAgentListUpdateFromState(state: ThreadSnapshot): Partial<AgentListEntry> {
  return projectAgentListUpdate({
    lifecycle: state.thread.lifecycle,
    onboardingFlow: state.thread.onboardingFlow,
    profile: state.thread.profile,
    metrics: state.thread.metrics,
    task: state.thread.task,
    haltReason: state.thread.haltReason,
    executionError: state.thread.executionError,
  });
}
