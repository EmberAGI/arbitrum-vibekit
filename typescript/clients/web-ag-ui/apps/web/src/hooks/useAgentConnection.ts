'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCopilotContext, useLangGraphInterruptRender } from '@copilotkit/react-core';
import {
  useAgent,
  useCopilotKit,
  CopilotKitCoreRuntimeConnectionStatus,
} from '@copilotkit/react-core/v2';
import { v7 } from 'uuid';
import { useLangGraphInterruptCustomUI } from '../app/hooks/useLangGraphInterruptCustomUI';
import { getAgentConfig, type AgentConfig } from '../config/agents';
import {
  type AgentState,
  type AgentView,
  type AgentViewProfile,
  type AgentViewMetrics,
  type AgentViewActivity,
  type AgentSettings,
  type AgentInterrupt,
  type OperatorConfigInput,
  type PendleSetupInput,
  type GmxSetupInput,
  type FundingTokenInput,
  type DelegationSigningResponse,
  type FundWalletAcknowledgement,
  type Transaction,
  type ClmmEvent,
  defaultView,
  defaultProfile,
  defaultMetrics,
  defaultActivity,
  defaultSettings,
  initialAgentState,
} from '../types/agent';
import { applyAgentSyncToState, parseAgentSyncResponse } from '../utils/agentSync';
import { fireAgentRun } from '../utils/fireAgentRun';
import { scheduleCycleAfterInterruptResolution } from '../utils/interruptAutoCycle';

export type {
  AgentState,
  AgentView,
  AgentViewProfile,
  AgentViewMetrics,
  AgentViewActivity,
  AgentSettings,
  AgentInterrupt,
  OperatorConfigInput,
  PendleSetupInput,
  GmxSetupInput,
  FundWalletAcknowledgement,
  FundingTokenInput,
  Transaction,
  ClmmEvent,
};

const isAgentInterrupt = (value: unknown): value is AgentInterrupt =>
  typeof value === 'object' &&
  value !== null &&
  ((value as { type?: string }).type === 'operator-config-request' ||
    (value as { type?: string }).type === 'pendle-setup-request' ||
    (value as { type?: string }).type === 'pendle-fund-wallet-request' ||
    (value as { type?: string }).type === 'gmx-setup-request' ||
    (value as { type?: string }).type === 'clmm-funding-token-request' ||
    (value as { type?: string }).type === 'pendle-funding-token-request' ||
    (value as { type?: string }).type === 'gmx-funding-token-request' ||
    (value as { type?: string }).type === 'clmm-delegation-signing-request' ||
    (value as { type?: string }).type === 'pendle-delegation-signing-request' ||
    (value as { type?: string }).type === 'gmx-delegation-signing-request');

export interface UseAgentConnectionResult {
  config: AgentConfig;
  isConnected: boolean;
  threadId: string | undefined;
  interruptRenderer: ReturnType<typeof useLangGraphInterruptRender>;

  // Full view state
  view: AgentView;
  profile: AgentViewProfile;
  metrics: AgentViewMetrics;
  activity: AgentViewActivity;
  transactionHistory: Transaction[];
  events: ClmmEvent[];
  settings: AgentSettings;

  // Derived state
  isHired: boolean;
  isActive: boolean;
  isHiring: boolean;
  isFiring: boolean;
  isSyncing: boolean;

  // Interrupt state
  activeInterrupt: AgentInterrupt | null;

  // Commands
  runHire: () => void;
  runFire: () => void;
  runSync: () => void;
  resolveInterrupt: (
    input:
      | OperatorConfigInput
      | PendleSetupInput
      | GmxSetupInput
      | FundWalletAcknowledgement
      | FundingTokenInput
      | DelegationSigningResponse,
  ) => void;

  // Settings management: updates local state then syncs to backend
  updateSettings: (updates: Partial<AgentSettings>) => void;
}

export function useAgentConnection(agentId: string): UseAgentConnectionResult {
  const [isHiring, setIsHiring] = useState(false);
  const [isFiring, setIsFiring] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastConnectedThreadRef = useRef<string | null>(null);
  const lastSyncedThreadRef = useRef<string | null>(null);
  const agentRef = useRef<ReturnType<typeof useAgent>['agent'] | null>(null);
  const messagesSnapshotRef = useRef(false);
  const runInFlightRef = useRef(false);
  const connectSeqRef = useRef(0);
  const agentDebugIdsRef = useRef(new WeakMap<object, number>());
  const nextAgentDebugIdRef = useRef(1);

  const config = getAgentConfig(agentId);

  const { copilotkit } = useCopilotKit();
  const { agent } = useAgent({
    agentId,
    updates: ['OnStateChanged'] as NonNullable<Parameters<typeof useAgent>[0]>['updates'],
  });
  const { threadId } = useCopilotContext();
  const runtimeStatus = copilotkit.runtimeConnectionStatus;

  const { activeInterrupt, resolve } = useLangGraphInterruptCustomUI<AgentInterrupt>({
    enabled: isAgentInterrupt,
  });
  const interruptRenderer = useLangGraphInterruptRender(agent);

  const debugConnect = process.env.NEXT_PUBLIC_AGENT_CONNECT_DEBUG === 'true';

  const getAgentDebugId = useCallback(
    (value: ReturnType<typeof useAgent>['agent'] | null) => {
      if (!value) return 'none';
      const key = value as unknown as object;
      const cached = agentDebugIdsRef.current.get(key);
      if (cached) return `agent#${cached}`;
      const nextId = nextAgentDebugIdRef.current;
      nextAgentDebugIdRef.current = nextId + 1;
      agentDebugIdsRef.current.set(key, nextId);
      return `agent#${nextId}`;
    },
    [],
  );

  const logConnectEvent = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      if (!debugConnect) return;
      console.debug('[agent-connect]', {
        ts: new Date().toISOString(),
        event,
        ...payload,
      });
    },
    [debugConnect],
  );

  // Simple command runner - no queuing, just run the command
  const runCommand = useCallback(
    (command: string) => {
      if (!agent || !threadId) return false;
      if (runInFlightRef.current) return false;

      runInFlightRef.current = true;

      const message = {
        id: v7(),
        role: 'user' as const,
        content: JSON.stringify({ command }),
      };

      agent.addMessage(message);
      void copilotkit.runAgent({ agent }).catch((error) => {
        runInFlightRef.current = false;
        console.error('Agent run failed', error);
      });

      return true;
    },
    [agent, copilotkit, threadId],
  );

  const hasStateValues = useCallback((value: unknown): value is AgentState => {
    return Boolean(value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0);
  }, []);

  const needsSync = useCallback((value: unknown): boolean => {
    if (!value || typeof value !== 'object') return true;
    const state = value as AgentState;
    const view = state.view;
    if (!view) return true;

    const profile = view.profile ?? defaultProfile;
    const metrics = view.metrics ?? defaultMetrics;
    const activity = view.activity ?? defaultActivity;

    const hasProfile =
      profile.totalUsers !== undefined ||
      profile.agentIncome !== undefined ||
      profile.aum !== undefined ||
      profile.apy !== undefined ||
      profile.pools.length > 0 ||
      profile.allowedPools.length > 0;
    const hasMetrics =
      metrics.iteration !== 0 ||
      metrics.cyclesSinceRebalance !== 0 ||
      metrics.staleCycles !== 0 ||
      metrics.lastSnapshot !== undefined ||
      metrics.latestCycle !== undefined ||
      metrics.previousPrice !== undefined ||
      metrics.aumUsd !== undefined ||
      metrics.apy !== undefined ||
      metrics.lifetimePnlUsd !== undefined ||
      metrics.latestSnapshot !== undefined ||
      metrics.rebalanceCycles !== undefined;
    const hasActivity = activity.telemetry.length > 0 || activity.events.length > 0;
    const hasHistory = view.transactionHistory.length > 0;

    return !(hasProfile || hasMetrics || hasActivity || hasHistory);
  }, []);

  useEffect(() => {
    if (!agent) {
      return undefined;
    }

    const clearRunFlag = () => {
      runInFlightRef.current = false;
    };

    const subscription = agent.subscribe({
      onRunStartedEvent: () => {
        runInFlightRef.current = true;
      },
      onRunFinishedEvent: clearRunFlag,
      onRunErrorEvent: clearRunFlag,
      onRunFailed: clearRunFlag,
      onRunFinalized: clearRunFlag,
      onRunInitialized: ({ state }) => {
        if (hasStateValues(state)) {
          agent.setState(state);
          return;
        }

        if (hasStateValues(agent.state)) {
          return;
        }

        agent.setState(initialAgentState);
      },
      onMessagesSnapshotEvent: () => {
        messagesSnapshotRef.current = true;
      },
    });

    return () => subscription.unsubscribe();
  }, [agent, hasStateValues]);

  // Initial sync when thread is established - runs once per agent instance
  useEffect(() => {
    agentRef.current = agent ?? null;
  }, [agent]);

  useEffect(() => {
    if (!agent) return undefined;

    return () => {
      logConnectEvent('cleanup', {
        agentId,
        agent: getAgentDebugId(agent),
        threadId,
      });
      agent.abortRun();
      void agent.detachActiveRun();
    };
  }, [agent, agentId, getAgentDebugId, logConnectEvent, threadId]);

  useEffect(() => {
    runInFlightRef.current = false;
    lastSyncedThreadRef.current = null;
    lastConnectedThreadRef.current = null;
  }, [threadId]);

  useEffect(() => {
    if (!threadId || !agent) return;
    if (runtimeStatus !== CopilotKitCoreRuntimeConnectionStatus.Connected) return;
    if (lastConnectedThreadRef.current === threadId) return;

    let cancelled = false;
    const connectSeq = connectSeqRef.current + 1;
    connectSeqRef.current = connectSeq;

    const connectAndSync = () => {
      const currentAgent = agentRef.current;
      if (!currentAgent) return;
      currentAgent.threadId = threadId;
      lastConnectedThreadRef.current = threadId;
      messagesSnapshotRef.current = false;

      const hasConnectAgent = typeof currentAgent.connectAgent === 'function';

      logConnectEvent('start', {
        agentId,
        seq: connectSeq,
        threadId,
        agent: getAgentDebugId(currentAgent),
        hasConnectAgent,
      });

      void copilotkit.connectAgent({ agent: currentAgent }).catch(() => {
        // Errors are already reported via CopilotKit core subscribers.
      });

      const startTime = Date.now();
      const syncDeadline = startTime + 8000;
      const scheduleSync = () => {
        if (cancelled) return;
        if (messagesSnapshotRef.current || Date.now() - startTime > 2000) {
          const shouldSync =
            !runInFlightRef.current &&
            lastSyncedThreadRef.current !== threadId &&
            needsSync(currentAgent.state);
          if (shouldSync) {
            if (runCommand('sync')) {
              lastSyncedThreadRef.current = threadId;
              return;
            }
            if (Date.now() < syncDeadline) {
              setTimeout(scheduleSync, 250);
            }
          }
          return;
        }
        setTimeout(scheduleSync, 100);
      };

      scheduleSync();
    };

    void connectAndSync();

    return () => {
      cancelled = true;
      logConnectEvent('effect-cleanup', {
        agentId,
        seq: connectSeq,
        threadId,
        agent: getAgentDebugId(agentRef.current),
      });
    };
  }, [
    threadId,
    agent,
    runtimeStatus,
    copilotkit,
    runCommand,
    hasStateValues,
    needsSync,
    agentId,
    getAgentDebugId,
    logConnectEvent,
  ]);

  // Poll `/api/agents/sync` to pick up backend-driven state changes (cron ticks, external runs).
  // CopilotKit connect should stream state, but this provides a deterministic fallback for the detail page.
  useEffect(() => {
    if (!threadId) return undefined;
    if (!agent) return undefined;

    const rawInterval = Number(process.env.NEXT_PUBLIC_AGENT_DETAIL_SYNC_POLL_MS ?? 5000);
    const intervalMs = Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 5000;

    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      if (cancelled) return;
      if (inFlight) return;
      if (runInFlightRef.current) return;

      inFlight = true;
      try {
        const response = await fetch('/api/agents/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, threadId }),
        });

        if (!response.ok) {
          return;
        }

        const parsed = parseAgentSyncResponse(await response.json().catch(() => null));
        const currentAgent = agentRef.current;
        if (!currentAgent) {
          return;
        }
        const currentState =
          hasStateValues(currentAgent.state) ? (currentAgent.state as AgentState) : initialAgentState;
        currentAgent.setState(applyAgentSyncToState(currentState, parsed));
      } catch {
        // Silence sync errors; connect stream still drives primary updates.
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agent, agentId, hasStateValues, threadId]);

  // Extract state with defaults
  const currentState =
    agent.state && Object.keys(agent.state).length > 0 ? (agent.state as AgentState) : initialAgentState;
  const view = currentState.view ?? defaultView;
  const profile = view.profile ?? defaultProfile;
  const metrics = view.metrics ?? defaultMetrics;
  const activity = view.activity ?? defaultActivity;
  const transactionHistory = view.transactionHistory ?? [];
  const events = activity.events ?? [];
  const settings = currentState.settings ?? defaultSettings;

  // Derived state
  const isHired = view.command === 'hire' || view.command === 'run' || view.command === 'cycle';
  const isActive = view.command !== undefined && view.command !== 'idle' && view.command !== 'fire';

  const runSync = useCallback(() => {
    if (!runCommand('sync')) return;
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2000);
  }, [runCommand]);

  const runHire = useCallback(() => {
    if (!isHired && !isHiring) {
      if (!runCommand('hire')) return;
      setIsHiring(true);
      setTimeout(() => setIsHiring(false), 5000);
    }
  }, [runCommand, isHired, isHiring]);

  const runFire = useCallback(() => {
    if (isFiring) return;

    setIsFiring(true);
    const currentAgent = agentRef.current;
    void fireAgentRun({
      agent: currentAgent,
      runAgent: async (value) =>
        copilotkit.runAgent({ agent: value } as unknown as Parameters<typeof copilotkit.runAgent>[0]),
      threadId,
      runInFlightRef,
      createId: v7,
    }).then((ok) => {
      if (!ok) {
        setIsFiring(false);
        return;
      }
      setTimeout(() => setIsFiring(false), 3000);
    });
  }, [copilotkit, isFiring, threadId]);

  const resolveInterrupt = useCallback(
    (
      input:
        | OperatorConfigInput
        | PendleSetupInput
        | FundWalletAcknowledgement
        | FundingTokenInput
        | DelegationSigningResponse,
    ) => {
      resolve(JSON.stringify(input));
      scheduleCycleAfterInterruptResolution({
        interruptType: activeInterrupt?.type,
        runCommand,
      });
    },
    [activeInterrupt?.type, resolve, runCommand],
  );

  // Settings sync pattern: update local state only (no automatic sync to avoid 409)
  const updateSettings = useCallback(
    (updates: Partial<AgentSettings>) => {
      agent.setState({
        ...currentState,
        settings: {
          ...(currentState.settings ?? defaultSettings),
          ...updates,
        },
      });
    },
    [agent, currentState],
  );

  return {
    config,
    isConnected: !!threadId,
    threadId,
    interruptRenderer,
    view,
    profile,
    metrics,
    activity,
    transactionHistory,
    events,
    settings,
    isHired,
    isActive,
    isHiring,
    isFiring,
    isSyncing,
    activeInterrupt: activeInterrupt ?? null,
    runHire,
    runFire,
    runSync,
    resolveInterrupt,
    updateSettings,
  };
}
