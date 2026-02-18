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
import { projectDetailStateFromPayload } from '../contexts/agentProjection';
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
import { cleanupAgentConnection } from '../utils/agentConnectionCleanup';
import { createAgentCommandScheduler } from '../utils/agentCommandScheduler';
import {
  acquireAgentStreamOwner,
  registerAgentStreamOwner,
  releaseAgentStreamOwner,
  unregisterAgentStreamOwner,
} from '../utils/agentStreamCoordinator';
import { fireAgentRun } from '../utils/fireAgentRun';
import { resumeInterruptViaAgent } from '../utils/interruptResolution';
import { scheduleCycleAfterInterruptResolution } from '../utils/interruptAutoCycle';
import { canonicalizeChainLabel } from '../utils/iconResolution';
import { isAgentRunning, isBusyRunError } from '../utils/runConcurrency';
import {
  isAgentInterrupt,
  selectActiveInterrupt,
} from '../utils/interruptSelection';

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

export interface UseAgentConnectionResult {
  config: AgentConfig;
  isConnected: boolean;
  hasLoadedView: boolean;
  threadId: string | undefined;
  interruptRenderer: ReturnType<typeof useLangGraphInterruptRender>;
  uiError: string | null;
  clearUiError: () => void;

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

  // Settings management
  updateSettings: (updates: Partial<AgentSettings>) => void;
  saveSettings: (updates: Partial<AgentSettings>) => void;
}

export function useAgentConnection(agentId: string): UseAgentConnectionResult {
  type HookAgent = NonNullable<ReturnType<typeof useAgent>['agent']>;

  const [isHiring, setIsHiring] = useState(false);
  const [isFiring, setIsFiring] = useState(false);
  const [syncingState, setSyncingState] = useState<{
    threadId: string | undefined;
    isSyncing: boolean;
  }>({
    threadId: undefined,
    isSyncing: false,
  });
  const [pendingSyncMutationByThread, setPendingSyncMutationByThread] = useState<{
    threadId: string | undefined;
    clientMutationId: string | null;
  }>({
    threadId: undefined,
    clientMutationId: null,
  });
  const pendingSyncMutationRef = useRef<{
    threadId: string | undefined;
    clientMutationId: string | null;
  }>({
    threadId: undefined,
    clientMutationId: null,
  });
  const [uiError, setUiError] = useState<string | null>(null);
  const lastConnectedThreadRef = useRef<string | null>(null);
  const agentRef = useRef<ReturnType<typeof useAgent>['agent'] | null>(null);
  const threadIdRef = useRef<string | undefined>(undefined);
  const messagesSnapshotRef = useRef(false);
  const runInFlightRef = useRef(false);
  const commandSchedulerRef = useRef<ReturnType<typeof createAgentCommandScheduler<HookAgent>> | null>(
    null,
  );
  const connectSeqRef = useRef(0);
  const agentDebugIdsRef = useRef(new WeakMap<object, number>());
  const nextAgentDebugIdRef = useRef(1);
  const streamOwnerIdRef = useRef<string | null>(null);

  if (streamOwnerIdRef.current == null) {
    streamOwnerIdRef.current = v7();
  }

  const config = getAgentConfig(agentId);

  const { copilotkit } = useCopilotKit();
  const { agent } = useAgent({
    agentId,
    updates: ['OnStateChanged'] as NonNullable<Parameters<typeof useAgent>[0]>['updates'],
  });
  const { threadId } = useCopilotContext();
  const runtimeStatus = copilotkit.runtimeConnectionStatus;

  const { activeInterrupt, canResolve, resolve } = useLangGraphInterruptCustomUI<AgentInterrupt>({
    enabled: isAgentInterrupt,
  });
  const interruptRenderer = useLangGraphInterruptRender(agent);

  const debugConnect = process.env.NEXT_PUBLIC_AGENT_CONNECT_DEBUG === 'true';

  const getAgentDebugId = useCallback((value: ReturnType<typeof useAgent>['agent'] | null) => {
    if (!value) return 'none';
    const key = value as unknown as object;
    const cached = agentDebugIdsRef.current.get(key);
    if (cached) return `agent#${cached}`;
    const nextId = nextAgentDebugIdRef.current;
    nextAgentDebugIdRef.current = nextId + 1;
    agentDebugIdsRef.current.set(key, nextId);
    return `agent#${nextId}`;
  }, []);

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

  const dispatchCommand = useCallback(
    (
      command: string,
      options?: { allowSyncCoalesce?: boolean; messagePayload?: Record<string, unknown> },
    ) => {
      const scheduler = commandSchedulerRef.current;
      if (!scheduler) {
        return false;
      }
      return scheduler.dispatch(command, options);
    },
    [],
  );

  const runCommand = useCallback((command: string) => dispatchCommand(command), [dispatchCommand]);

  const hasStateValues = useCallback((value: unknown): value is AgentState => {
    return Boolean(
      value &&
      typeof value === 'object' &&
      Object.keys(value as Record<string, unknown>).length > 0,
    );
  }, []);

  const extractAppliedMutationId = useCallback((value: unknown): string | null => {
    if (typeof value !== 'object' || value === null) return null;
    if (!('view' in value)) return null;
    const view = (value as { view?: unknown }).view;
    if (typeof view !== 'object' || view === null) return null;
    if (!('lastAppliedClientMutationId' in view)) return null;
    const mutationId = (view as { lastAppliedClientMutationId?: unknown }).lastAppliedClientMutationId;
    return typeof mutationId === 'string' && mutationId.length > 0 ? mutationId : null;
  }, []);

  useEffect(() => {
    pendingSyncMutationRef.current = pendingSyncMutationByThread;
  }, [pendingSyncMutationByThread]);

  const needsSync = useCallback((value: unknown): boolean => {
    if (!value || typeof value !== 'object') return true;
    const state = value as AgentState;
    const view = state.view;
    if (!view) return true;

    // The backend state can arrive partially-shaped (missing array fields). Keep the UI resilient
    // by normalizing anything that should be an array to an empty array before reading `.length`.
    const profileRaw = view.profile ?? defaultProfile;
    const metrics = view.metrics ?? defaultMetrics;
    const activityRaw = view.activity ?? defaultActivity;
    const profile: AgentViewProfile = {
      ...profileRaw,
      chains: Array.isArray(profileRaw.chains) ? profileRaw.chains : [],
      protocols: Array.isArray(profileRaw.protocols) ? profileRaw.protocols : [],
      tokens: Array.isArray(profileRaw.tokens) ? profileRaw.tokens : [],
      pools: Array.isArray(profileRaw.pools) ? profileRaw.pools : [],
      allowedPools: Array.isArray(profileRaw.allowedPools) ? profileRaw.allowedPools : [],
    };
    const activity: AgentViewActivity = {
      ...activityRaw,
      telemetry: Array.isArray(activityRaw.telemetry) ? activityRaw.telemetry : [],
      events: Array.isArray(activityRaw.events) ? activityRaw.events : [],
    };

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
    const transactionHistory = Array.isArray(view.transactionHistory) ? view.transactionHistory : [];
    const hasHistory = transactionHistory.length > 0;

    return !(hasProfile || hasMetrics || hasActivity || hasHistory);
  }, []);

  useEffect(() => {
    if (!agent) {
      return undefined;
    }

    const getInputThreadId = (payload: unknown): string | null => {
      if (typeof payload !== 'object' || payload === null) return null;
      if (!('input' in payload)) return null;
      const input = (payload as { input?: unknown }).input;
      if (typeof input !== 'object' || input === null) return null;
      if (!('threadId' in input)) return null;
      const threadIdValue = (input as { threadId?: unknown }).threadId;
      return typeof threadIdValue === 'string' ? threadIdValue : null;
    };

    const isCurrentThreadEvent = (payload: unknown): boolean => {
      const inputThreadId = getInputThreadId(payload);
      const currentThreadId = threadIdRef.current;
      if (!inputThreadId || !currentThreadId) return true;
      return inputThreadId === currentThreadId;
    };

    const clearRunFlag = (payload?: unknown) => {
      if (!isCurrentThreadEvent(payload)) return;
      commandSchedulerRef.current?.handleRunTerminal();
    };

    const subscription = agent.subscribe({
      onRunStartedEvent: (payload) => {
        if (!isCurrentThreadEvent(payload)) return;
        runInFlightRef.current = true;
      },
      onRunFinishedEvent: (payload) => clearRunFlag(payload),
      onRunErrorEvent: (payload) => clearRunFlag(payload),
      onRunFailed: (payload) => clearRunFlag(payload),
      onRunFinalized: (payload) => clearRunFlag(payload),
      onRunInitialized: (payload) => {
        if (!isCurrentThreadEvent(payload)) return;
        const state = payload.state;
        const appliedMutationId = extractAppliedMutationId(state);
        const pendingSyncMutation = pendingSyncMutationRef.current;
        if (
          appliedMutationId &&
          pendingSyncMutation.clientMutationId !== null &&
          pendingSyncMutation.threadId === threadIdRef.current &&
          appliedMutationId === pendingSyncMutation.clientMutationId
        ) {
          setPendingSyncMutationByThread({
            threadId: threadIdRef.current,
            clientMutationId: null,
          });
        }
        const projectedState = projectDetailStateFromPayload(state);
        if (projectedState) {
          agent.setState(projectedState);
          return;
        }

        if (projectDetailStateFromPayload(agent.state)) {
          return;
        }

        agent.setState(initialAgentState);
      },
      onMessagesSnapshotEvent: (payload) => {
        if (!isCurrentThreadEvent(payload)) return;
        messagesSnapshotRef.current = true;
      },
    });

    return () => subscription.unsubscribe();
  }, [agent, extractAppliedMutationId, hasStateValues]);

  // Initial sync when thread is established - runs once per agent instance
  useEffect(() => {
    agentRef.current = agent ?? null;
  }, [agent]);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    const scheduler = createAgentCommandScheduler<HookAgent>({
      getAgent: () => agentRef.current as HookAgent | null,
      getThreadId: () => threadIdRef.current,
      getRunInFlight: () => runInFlightRef.current,
      setRunInFlight: (next) => {
        runInFlightRef.current = next;
      },
      runAgent: async (currentAgent) => copilotkit.runAgent({ agent: currentAgent }),
      createId: v7,
      isBusyRunError,
      isAgentRunning,
      onSyncingChange: (isSyncing) => {
        setSyncingState({
          threadId: threadIdRef.current,
          isSyncing,
        });
      },
      onCommandBusy: (command, error) => {
        const detail = error instanceof Error ? error.message : String(error);
        if (command === 'sync') {
          setPendingSyncMutationByThread({
            threadId: threadIdRef.current,
            clientMutationId: null,
          });
        }
        setUiError(`Agent run is busy while processing '${command}'. Please retry in a moment.`);
        console.warn('[useAgentConnection] Busy command dispatch', {
          command,
          threadId: threadIdRef.current,
          detail,
        });
      },
      onCommandError: (command, error) => {
        if (command === 'sync') {
          setPendingSyncMutationByThread({
            threadId: threadIdRef.current,
            clientMutationId: null,
          });
        }
        console.error('Agent run failed', error);
        const detail = error instanceof Error ? error.message : String(error);
        setUiError(`Agent command '${command}' failed: ${detail}`);
      },
    });

    commandSchedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      if (commandSchedulerRef.current === scheduler) {
        commandSchedulerRef.current = null;
      }
    };
  }, [copilotkit]);

  useEffect(() => {
    const ownerId = streamOwnerIdRef.current;
    if (!ownerId) return undefined;

    registerAgentStreamOwner(ownerId, async () => {
      const currentAgent = agentRef.current;
      if (!currentAgent) return;
      logConnectEvent('preempt-cleanup', {
        agentId,
        agent: getAgentDebugId(currentAgent),
      });
      await cleanupAgentConnection(currentAgent);
    });

    return () => {
      releaseAgentStreamOwner(ownerId);
      unregisterAgentStreamOwner(ownerId);
    };
  }, [agentId, getAgentDebugId, logConnectEvent]);

  useEffect(() => {
    if (!agent) return undefined;

    return () => {
      logConnectEvent('cleanup', {
        agentId,
        agent: getAgentDebugId(agent),
        threadId,
      });
      void cleanupAgentConnection(agent);
    };
  }, [agent, agentId, getAgentDebugId, logConnectEvent, threadId]);

  useEffect(() => {
    runInFlightRef.current = false;
    lastConnectedThreadRef.current = null;
    commandSchedulerRef.current?.reset();
  }, [threadId]);

  useEffect(() => {
    if (!agent) return;
    if (runtimeStatus === CopilotKitCoreRuntimeConnectionStatus.Connected) return;
    if (!lastConnectedThreadRef.current) return;

    const ownerId = streamOwnerIdRef.current;
    if (ownerId) {
      releaseAgentStreamOwner(ownerId);
    }

    logConnectEvent('runtime-disconnected-cleanup', {
      agentId,
      agent: getAgentDebugId(agent),
      threadId: lastConnectedThreadRef.current,
      runtimeStatus,
    });

    lastConnectedThreadRef.current = null;
    messagesSnapshotRef.current = false;
    void cleanupAgentConnection(agent);
  }, [agent, runtimeStatus, agentId, getAgentDebugId, logConnectEvent]);

  useEffect(() => {
    if (!threadId || !agent) return;
    if (runtimeStatus !== CopilotKitCoreRuntimeConnectionStatus.Connected) return;
    if (lastConnectedThreadRef.current === threadId) return;
    const ownerId = streamOwnerIdRef.current;
    if (!ownerId) return;

    let canceled = false;
    const connectSeq = connectSeqRef.current + 1;
    connectSeqRef.current = connectSeq;

    const connectOnly = async () => {
      const currentAgent = agentRef.current;
      if (!currentAgent) return;

      await acquireAgentStreamOwner(ownerId);
      if (canceled) return;

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
    };

    void connectOnly();

    return () => {
      canceled = true;
      logConnectEvent('effect-cleanup', {
        agentId,
        seq: connectSeq,
        threadId,
        agent: getAgentDebugId(agentRef.current),
      });
      releaseAgentStreamOwner(ownerId);
    };
  }, [
    threadId,
    agent,
    runtimeStatus,
    copilotkit,
    agentId,
    getAgentDebugId,
    logConnectEvent,
  ]);

  // Extract state with defaults
  const currentState =
    agent.state && Object.keys(agent.state).length > 0
      ? (agent.state as AgentState)
      : initialAgentState;
  const view = currentState.view ?? defaultView;
  const profile = view.profile ?? defaultProfile;
  const metrics = view.metrics ?? defaultMetrics;
  const activity = view.activity ?? defaultActivity;
  const transactionHistory = view.transactionHistory ?? [];
  const events = activity.events ?? [];
  const settings = currentState.settings ?? defaultSettings;
  const syncRunPending = syncingState.threadId === threadId ? syncingState.isSyncing : false;
  const pendingSyncMutationId =
    pendingSyncMutationByThread.threadId === threadId
      ? pendingSyncMutationByThread.clientMutationId
      : null;
  const isSyncing = syncRunPending || pendingSyncMutationId !== null;

  const mergeUniqueStrings = (params: {
    primary: string[];
    secondary: string[];
    keyFn: (value: string) => string;
    mapFn?: (value: string) => string;
  }): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();

    const push = (value: string) => {
      const trimmed = (params.mapFn ? params.mapFn(value) : value).trim();
      if (trimmed.length === 0) return;
      const key = params.keyFn(trimmed);
      if (key.length === 0) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(trimmed);
    };

    for (const value of params.primary) push(value);
    for (const value of params.secondary) push(value);
    return out;
  };

  const profileWithFallback: AgentViewProfile = {
    ...profile,
    chains: mergeUniqueStrings({
      primary: profile.chains,
      secondary: config.chains ?? [],
      mapFn: canonicalizeChainLabel,
      keyFn: (value) => canonicalizeChainLabel(value).toLowerCase(),
    }),
    protocols: mergeUniqueStrings({
      primary: profile.protocols,
      secondary: config.protocols ?? [],
      keyFn: (value) => value.toLowerCase(),
    }),
    tokens: mergeUniqueStrings({
      primary: profile.tokens,
      secondary: config.tokens ?? [],
      keyFn: (value) => value.toUpperCase(),
    }),
  };

  // Derived state
  const isHired =
    view.command === 'hire' ||
    view.command === 'run' ||
    view.command === 'cycle' ||
    // `fire` is still a hired agent state: the user is firing an already-hired agent.
    // Treat it as hired so the UI does not flash back to the pre-hire layout during the fire run.
    view.command === 'fire' ||
    (typeof view.onboarding?.step === 'number' && Number.isFinite(view.onboarding.step));
  const isActive = view.command !== undefined && view.command !== 'idle' && view.command !== 'fire';
  const hasLoadedView = !needsSync(currentState);

  const runSync = useCallback(() => {
    setUiError(null);
    const accepted = dispatchCommand('sync', { allowSyncCoalesce: true });
    if (!accepted) {
      setUiError('Unable to queue sync right now. Please retry.');
    }
  }, [dispatchCommand]);

  const runHire = useCallback(() => {
    if (!isHired && !isHiring) {
      setUiError(null);
      if (!runCommand('hire')) {
        setUiError('Unable to start hire while another run is active.');
        return;
      }

      // Optimistically flip the UI into the hired/onboarding layout immediately after the user
      // initiates the hire command. Otherwise we can briefly render the pre-hire layout until the
      // first backend state update arrives.
      const optimisticAgent = agentRef.current;
      if (optimisticAgent) {
        const currentState =
          hasStateValues(optimisticAgent.state) ? (optimisticAgent.state as AgentState) : initialAgentState;
        const view = currentState.view ?? defaultView;
        optimisticAgent.setState({
          ...currentState,
          view: {
            ...view,
            command: 'hire',
          },
        });
      }

      setIsHiring(true);
      setTimeout(() => setIsHiring(false), 5000);
    }
  }, [hasStateValues, isHired, isHiring, runCommand]);

  const runFire = useCallback(() => {
    if (isFiring) return;

    setUiError(null);
    setIsFiring(true);
    // Optimistic UI update for symmetry with hire: switch the header pill immediately.
    const optimisticAgent = agentRef.current;
    const previousCommand = (() => {
      if (!optimisticAgent) return undefined;
      const currentState =
        hasStateValues(optimisticAgent.state) ? (optimisticAgent.state as AgentState) : initialAgentState;
      return (currentState.view ?? defaultView).command;
    })();
    if (optimisticAgent) {
      const currentState =
        hasStateValues(optimisticAgent.state) ? (optimisticAgent.state as AgentState) : initialAgentState;
      const view = currentState.view ?? defaultView;
      optimisticAgent.setState({
        ...currentState,
        view: {
          ...view,
          command: 'fire',
        },
      });
    }

    const revertOptimisticFireCommand = () => {
      const current = agentRef.current;
      if (!current) return;
      const currentState =
        hasStateValues(current.state) ? (current.state as AgentState) : initialAgentState;
      const view = currentState.view ?? defaultView;
      if (view.command === 'fire') {
        current.setState({
          ...currentState,
          view: {
            ...view,
            command: previousCommand,
          },
        });
      }
    };

    const scheduler = commandSchedulerRef.current;
    if (!scheduler) {
      setUiError('Unable to submit fire command right now. Please retry.');
      setIsFiring(false);
      revertOptimisticFireCommand();
      return;
    }

    const accepted = scheduler.dispatchCustom({
      command: 'fire',
      allowPreemptive: true,
      run: async (value) => {
        const ok = await fireAgentRun({
          agent: value,
          runAgent: async (current) =>
            copilotkit.runAgent({ agent: current } as unknown as Parameters<typeof copilotkit.runAgent>[0]),
          preemptActiveRun: async (current) => copilotkit.stopAgent({ agent: current }),
          threadId,
          runInFlightRef,
          createId: v7,
          onError: (message) => {
            setUiError(message);
            setIsFiring(false);
            revertOptimisticFireCommand();
          },
        });

        if (!ok) {
          setUiError('Unable to submit fire command right now. Please retry.');
          setIsFiring(false);
          revertOptimisticFireCommand();
        }
      },
    });

    if (!accepted) {
      setUiError('Unable to submit fire command while another command is active.');
      setIsFiring(false);
      revertOptimisticFireCommand();
      return;
    }

    setTimeout(() => setIsFiring(false), 3000);
  }, [copilotkit, hasStateValues, isFiring, threadId]);

  const clearUiError = useCallback(() => setUiError(null), []);
  const effectiveActiveInterrupt = selectActiveInterrupt({
    streamInterrupt: activeInterrupt ?? null,
    syncPendingInterrupt: null,
  });

  const resolveInterrupt = useCallback(
    (
      input:
        | OperatorConfigInput
        | PendleSetupInput
        | GmxSetupInput
        | FundWalletAcknowledgement
        | FundingTokenInput
        | DelegationSigningResponse,
    ) => {
      const serializedInput = JSON.stringify(input);
      const interruptType = effectiveActiveInterrupt?.type;
      const hasStreamInterrupt = activeInterrupt !== null;

      if (hasStreamInterrupt && canResolve()) {
        resolve(serializedInput);
        scheduleCycleAfterInterruptResolution({
          interruptType,
          runCommand,
        });
        return;
      }

      const scheduler = commandSchedulerRef.current;
      if (!scheduler) {
        setUiError('Unable to submit onboarding input right now. Please retry.');
        return;
      }

      const accepted = scheduler.dispatchCustom({
        command: 'resume',
        run: async (currentAgent) => {
          const resumed = await resumeInterruptViaAgent({
            agent: currentAgent as Parameters<typeof resumeInterruptViaAgent>[0]['agent'],
            resumePayload: serializedInput,
          });
          if (!resumed) {
            throw new Error('Unable to submit onboarding input right now. Please retry.');
          }
          scheduleCycleAfterInterruptResolution({
            interruptType,
            runCommand,
          });
        },
      });

      if (!accepted) {
        setUiError('Unable to submit onboarding input right now. Please retry.');
        return;
      }
    },
    [activeInterrupt, canResolve, effectiveActiveInterrupt?.type, resolve, runCommand],
  );

  // Local settings mutation helper; caller decides whether to enqueue a sync run.
  const updateSettings = useCallback(
    (updates: Partial<AgentSettings>) => {
      const currentAgent = agentRef.current;
      if (!currentAgent) return;

      const nextState =
        hasStateValues(currentAgent.state) ? (currentAgent.state as AgentState) : initialAgentState;

      currentAgent.setState({
        ...nextState,
        settings: {
          ...(nextState.settings ?? defaultSettings),
          ...updates,
        },
      });
    },
    [hasStateValues],
  );

  const saveSettings = useCallback(
    (updates: Partial<AgentSettings>) => {
      setUiError(null);
      const clientMutationId = v7();
      setPendingSyncMutationByThread({
        threadId,
        clientMutationId,
      });
      updateSettings(updates);
      const accepted = dispatchCommand('sync', {
        allowSyncCoalesce: true,
        messagePayload: {
          clientMutationId,
        },
      });
      if (!accepted) {
        setPendingSyncMutationByThread({
          threadId,
          clientMutationId: null,
        });
        setUiError('Unable to sync settings right now. Please retry.');
      }
    },
    [dispatchCommand, threadId, updateSettings],
  );

  return {
    config,
    isConnected: !!threadId,
    hasLoadedView,
    threadId,
    interruptRenderer,
    uiError,
    clearUiError,
    view,
    profile: profileWithFallback,
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
    activeInterrupt: effectiveActiveInterrupt,
    runHire,
    runFire,
    runSync,
    resolveInterrupt,
    updateSettings,
    saveSettings,
  };
}
