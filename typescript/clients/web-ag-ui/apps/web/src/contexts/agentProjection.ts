import {
  defaultActivity,
  defaultMetrics,
  defaultProfile,
  defaultSettings,
  defaultView,
  initialAgentState,
  type AgentState,
  type AgentView,
} from '../types/agent';
import type { AgentListEntry } from './agentListTypes';
import { projectAgentListUpdate } from './agentListProjection';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneInitialState(): AgentState {
  return {
    ...initialAgentState,
    messages: [],
    copilotkit: { actions: [], context: [] },
    settings: { ...defaultSettings },
    view: {
      ...defaultView,
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

export function projectDetailStateFromPayload(payload: unknown): AgentState | null {
  if (!isRecord(payload)) return null;
  if (Object.keys(payload).length === 0) return null;

  const incoming = payload as Partial<AgentState>;
  const projected = cloneInitialState();

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

  const incomingView = isRecord(incoming.view) ? (incoming.view as Partial<AgentView>) : {};
  const incomingProfile = isRecord(incomingView.profile)
    ? incomingView.profile
    : ({} as Partial<AgentView['profile']>);
  const incomingActivity = isRecord(incomingView.activity)
    ? incomingView.activity
    : ({} as Partial<AgentView['activity']>);
  const incomingMetrics = isRecord(incomingView.metrics)
    ? incomingView.metrics
    : ({} as Partial<AgentView['metrics']>);

  projected.view = {
    ...projected.view,
    ...incomingView,
    profile: {
      ...projected.view.profile,
      ...incomingProfile,
      chains: Array.isArray(incomingProfile.chains)
        ? incomingProfile.chains
        : projected.view.profile.chains,
      protocols: Array.isArray(incomingProfile.protocols)
        ? incomingProfile.protocols
        : projected.view.profile.protocols,
      tokens: Array.isArray(incomingProfile.tokens)
        ? incomingProfile.tokens
        : projected.view.profile.tokens,
      pools: Array.isArray(incomingProfile.pools)
        ? incomingProfile.pools
        : projected.view.profile.pools,
      allowedPools: Array.isArray(incomingProfile.allowedPools)
        ? incomingProfile.allowedPools
        : projected.view.profile.allowedPools,
    },
    activity: {
      ...projected.view.activity,
      ...incomingActivity,
      telemetry: Array.isArray(incomingActivity.telemetry)
        ? incomingActivity.telemetry
        : projected.view.activity.telemetry,
      events: Array.isArray(incomingActivity.events)
        ? incomingActivity.events
        : projected.view.activity.events,
    },
    metrics: {
      ...projected.view.metrics,
      ...incomingMetrics,
    },
    transactionHistory: Array.isArray(incomingView.transactionHistory)
      ? incomingView.transactionHistory
      : projected.view.transactionHistory,
  };

  return projected;
}

export function projectAgentListUpdateFromState(state: AgentState): Partial<AgentListEntry> {
  return projectAgentListUpdate({
    command: state.view.command,
    profile: state.view.profile,
    metrics: state.view.metrics,
    task: state.view.task,
    haltReason: state.view.haltReason,
    executionError: state.view.executionError,
  });
}
