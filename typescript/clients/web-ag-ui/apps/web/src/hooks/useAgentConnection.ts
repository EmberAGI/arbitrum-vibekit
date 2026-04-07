'use client';

import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { Message } from '@ag-ui/core';
import { useCopilotContext } from '@copilotkit/react-core';
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
  type ThreadSnapshot,
  type ThreadState,
  type UiState,
  type ThreadProfile,
  type ThreadMetrics,
  type ThreadActivity,
  type AgentSettings,
  type AgentInterrupt,
  type OperatorConfigInput,
  type PendleSetupInput,
  type PortfolioManagerSetupInput,
  type GmxSetupInput,
  type PiOperatorNoteInput,
  type FundingTokenInput,
  type DelegationSigningResponse,
  type FundWalletAcknowledgement,
  type Transaction,
  type ClmmEvent,
  defaultThreadState,
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
import { fireAgentRun, logFireCommandDebug } from '../utils/fireAgentRun';
import { resumeInterruptViaAgent } from '../utils/interruptResolution';
import { scheduleCycleAfterInterruptResolution } from '../utils/interruptAutoCycle';
import { canonicalizeChainLabel } from '../utils/iconResolution';
import { isAbortLikeError, isAgentRunning, isBusyRunError } from '../utils/runConcurrency';
import { deriveUiState } from '../utils/deriveUiState';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';
import { getAgentThreadId } from '../utils/agentThread';
import {
  isAgentInterrupt,
  normalizeAgentInterrupt,
  selectActiveInterrupt,
} from '../utils/interruptSelection';

const CONNECT_BUSY_RETRY_MS = 2_000;

function messagesEqual(left: Message[], right: Message[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftMessage = left[index];
    const rightMessage = right[index];
    if (leftMessage.id !== rightMessage.id) return false;
    if (leftMessage.role !== rightMessage.role) return false;
    if (JSON.stringify(leftMessage.content) !== JSON.stringify(rightMessage.content)) return false;
  }

  return true;
}

function deriveSyncedInterrupt(state: ThreadSnapshot): AgentInterrupt | null {
  const threadState = state.thread;

  if (threadState?.task?.taskStatus?.state !== 'input-required') {
    return null;
  }

  const taskInterrupts = Array.isArray(state.tasks) ? state.tasks : [];

  for (let taskIndex = taskInterrupts.length - 1; taskIndex >= 0; taskIndex -= 1) {
    const task = taskInterrupts[taskIndex];
    const interrupts = Array.isArray(task?.interrupts) ? task.interrupts : [];

    for (let interruptIndex = interrupts.length - 1; interruptIndex >= 0; interruptIndex -= 1) {
      const interrupt = interrupts[interruptIndex];
      if (typeof interrupt !== 'object' || interrupt === null || !('value' in interrupt)) {
        continue;
      }

      const normalizedInterrupt = normalizeAgentInterrupt(interrupt.value);
      if (normalizedInterrupt) {
        return normalizedInterrupt;
      }
    }
  }

  const events = threadState.activity?.events ?? [];

  for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex -= 1) {
    const event = events[eventIndex];
    if (event?.type !== 'dispatch-response') {
      continue;
    }

    for (let partIndex = event.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = event.parts[partIndex];
      if (part.kind !== 'a2ui') {
        continue;
      }

      const payloadEnvelope =
        typeof part.data === 'object' &&
        part.data !== null &&
        'payload' in part.data &&
        typeof part.data.payload === 'object' &&
        part.data.payload !== null
          ? (part.data.payload as { kind?: unknown; payload?: unknown })
          : null;

      if (payloadEnvelope?.kind !== 'interrupt') {
        continue;
      }

      return normalizeAgentInterrupt(payloadEnvelope.payload);
    }
  }

  return null;
}

export type {
  ThreadSnapshot,
  ThreadState,
  UiState,
  ThreadProfile,
  ThreadMetrics,
  ThreadActivity,
  AgentSettings,
  AgentInterrupt,
  OperatorConfigInput,
  PendleSetupInput,
  PortfolioManagerSetupInput,
  GmxSetupInput,
  PiOperatorNoteInput,
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
  interruptRenderer: ReactNode | null;
  uiError: string | null;
  clearUiError: () => void;

  // View-model state consumed by React
  uiState: UiState;
  profile: ThreadProfile;
  metrics: ThreadMetrics;
  activity: ThreadActivity;
  transactionHistory: Transaction[];
  events: ClmmEvent[];
  messages: Message[];
  messageSnapshotEpoch: number;
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
  sendChatMessage: (content: string) => void;
  resolveInterrupt: (
    input:
      | OperatorConfigInput
      | PendleSetupInput
      | PortfolioManagerSetupInput
      | GmxSetupInput
      | PiOperatorNoteInput
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
  const [connectRetryTick, setConnectRetryTick] = useState(0);
  const pendingSyncMutationRef = useRef<{
    threadId: string | undefined;
    clientMutationId: string | null;
  }>({
    threadId: undefined,
    clientMutationId: null,
  });
  const [uiError, setUiError] = useState<string | null>(null);
  const [messageSnapshotEpoch, setMessageSnapshotEpoch] = useState(0);
  const lastConnectedThreadRef = useRef<string | null>(null);
  const agentRef = useRef<ReturnType<typeof useAgent>['agent'] | null>(null);
  const threadIdRef = useRef<string | undefined>(undefined);
  const activeRunRef = useRef<{
    threadId: string | undefined;
    runId: string | null;
  }>({
    threadId: undefined,
    runId: null,
  });
  const runInFlightRef = useRef(false);
  const commandSchedulerRef = useRef<ReturnType<typeof createAgentCommandScheduler<HookAgent>> | null>(
    null,
  );
  const connectSeqRef = useRef(0);
  const agentDebugIdsRef = useRef(new WeakMap<object, number>());
  const nextAgentDebugIdRef = useRef(1);
  const streamOwnerIdRef = useRef<string | null>(null);
  const disconnectRequestKeyRef = useRef<string | null>(null);
  const connectRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (streamOwnerIdRef.current == null) {
    streamOwnerIdRef.current = v7();
  }

  const config = getAgentConfig(agentId);

  const { copilotkit } = useCopilotKit();
  const { agent } = useAgent({
    agentId,
    updates: ['OnStateChanged'] as NonNullable<Parameters<typeof useAgent>[0]>['updates'],
  });
  const { threadId: copilotThreadId } = useCopilotContext();
  const { privyWallet } = usePrivyWalletClient();
  const threadId = getAgentThreadId(agentId, privyWallet?.address) ?? copilotThreadId;
  const runtimeStatus = copilotkit.runtimeConnectionStatus;

  const { activeInterrupt } = useLangGraphInterruptCustomUI<AgentInterrupt>({
    enabled: isAgentInterrupt,
  });
  const interruptRenderer = null;

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

  const emitConnectTrace = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      if (!debugConnect) return;

      const body = JSON.stringify({
        ts: new Date().toISOString(),
        event,
        agentId,
        threadId: threadId ?? null,
        runtimeStatus,
        seq: connectSeqRef.current,
        ownerId: streamOwnerIdRef.current,
        lastConnectedThread: lastConnectedThreadRef.current,
        path: typeof window === 'undefined' ? undefined : window.location.pathname,
        visibilityState: typeof document === 'undefined' ? undefined : document.visibilityState,
        hasFocus: typeof document === 'undefined' ? undefined : document.hasFocus(),
        payload,
      });

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/agent-connect-debug', blob);
        return;
      }

      void fetch('/api/agent-connect-debug', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body,
        keepalive: true,
      }).catch(() => {
        // best-effort trace only
      });
    },
    [agentId, debugConnect, runtimeStatus, threadId],
  );

  const clearConnectRetryTimer = useCallback(() => {
    if (connectRetryTimeoutRef.current === null) return;
    clearTimeout(connectRetryTimeoutRef.current);
    connectRetryTimeoutRef.current = null;
  }, []);

  const disconnectRuntimeStream = useCallback(
    async (params: { threadId: string | null; agent: string; reason: string }) => {
      if (!params.threadId) return;
      const requestKey = `${agentId}:${params.threadId}`;
      if (disconnectRequestKeyRef.current === requestKey) {
        logConnectEvent('preempt-cleanup-disconnect-skip', {
          agentId,
          agent: params.agent,
          threadId: params.threadId,
          reason: params.reason,
        });
        emitConnectTrace('disconnect-skip', {
          agent: params.agent,
          threadId: params.threadId,
          reason: params.reason,
        });
        return;
      }

      disconnectRequestKeyRef.current = requestKey;
      logConnectEvent('preempt-cleanup-disconnect', {
        agentId,
        agent: params.agent,
        threadId: params.threadId,
        reason: params.reason,
      });
      emitConnectTrace('disconnect-request', {
        agent: params.agent,
        threadId: params.threadId,
        reason: params.reason,
      });

      await Promise.resolve(
        fetch('/api/agent-disconnect', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            agentId,
            threadId: params.threadId,
          }),
          keepalive: true,
        }),
      ).catch(() => {
        // Best-effort runtime-side connect teardown.
      });
    },
    [agentId, emitConnectTrace, logConnectEvent],
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

  const runAgentOnCurrentThread = useCallback(
    (
      currentAgent: HookAgent,
      options?: {
        forwardedProps?: Record<string, unknown>;
      },
    ) =>
      copilotkit.runAgent({
        agent: currentAgent,
        ...(threadIdRef.current ? { threadId: threadIdRef.current } : {}),
        ...(options?.forwardedProps ? { forwardedProps: options.forwardedProps } : {}),
      } as unknown as Parameters<typeof copilotkit.runAgent>[0]),
    [copilotkit],
  );

  const runDirectCommand = useCallback(
    (command: string) => {
      const scheduler = commandSchedulerRef.current;
      if (!scheduler) {
        return false;
      }

      return scheduler.dispatchCustom({
        command,
        run: async (currentAgent) =>
          runAgentOnCurrentThread(currentAgent, {
            forwardedProps: {
              command: {
                name: command,
              },
            },
          }),
      });
    },
    [runAgentOnCurrentThread],
  );

  const runCommand = useCallback(
    (command: string) => {
      if (config.imperativeCommandTransport === 'forwarded-props') {
        return runDirectCommand(command);
      }

      return dispatchCommand(command);
    },
    [config.imperativeCommandTransport, dispatchCommand, runDirectCommand],
  );

  const setRunInFlight = useCallback((next: boolean) => {
    runInFlightRef.current = next;
  }, []);

  const hasStateValues = useCallback((value: unknown): value is ThreadSnapshot => {
    return Boolean(
      value &&
      typeof value === 'object' &&
      Object.keys(value as Record<string, unknown>).length > 0,
    );
  }, []);

  const extractAppliedMutationId = useCallback((value: unknown): string | null => {
    if (typeof value !== 'object' || value === null) return null;
    const stateEnvelope = value as { thread?: unknown };
    const stateSlice = stateEnvelope.thread;
    if (typeof stateSlice !== 'object' || stateSlice === null) return null;
    if (!('lastAppliedClientMutationId' in stateSlice)) return null;
    const mutationId = (stateSlice as { lastAppliedClientMutationId?: unknown })
      .lastAppliedClientMutationId;
    return typeof mutationId === 'string' && mutationId.length > 0 ? mutationId : null;
  }, []);

  useEffect(() => {
    pendingSyncMutationRef.current = pendingSyncMutationByThread;
  }, [pendingSyncMutationByThread]);

  const needsSync = useCallback((value: unknown): boolean => {
    if (!value || typeof value !== 'object') return true;
    const state = value as ThreadSnapshot;
    const threadState = state.thread;
    if (!threadState) return true;

    // The backend state can arrive partially-shaped (missing array fields). Keep the UI resilient
    // by normalizing anything that should be an array to an empty array before reading `.length`.
    const profileRaw = threadState.profile ?? defaultProfile;
    const metrics = threadState.metrics ?? defaultMetrics;
    const activityRaw = threadState.activity ?? defaultActivity;
    const profile: ThreadProfile = {
      ...profileRaw,
      chains: Array.isArray(profileRaw.chains) ? profileRaw.chains : [],
      protocols: Array.isArray(profileRaw.protocols) ? profileRaw.protocols : [],
      tokens: Array.isArray(profileRaw.tokens) ? profileRaw.tokens : [],
      pools: Array.isArray(profileRaw.pools) ? profileRaw.pools : [],
      allowedPools: Array.isArray(profileRaw.allowedPools) ? profileRaw.allowedPools : [],
    };
    const activity: ThreadActivity = {
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
    const transactionHistory = Array.isArray(threadState.transactionHistory)
      ? threadState.transactionHistory
      : [];
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

    const getInputRunId = (payload: unknown): string | null => {
      if (typeof payload !== 'object' || payload === null) return null;
      if ('input' in payload) {
        const input = (payload as { input?: unknown }).input;
        if (typeof input === 'object' && input !== null) {
          if ('runId' in input) {
            const runIdValue = (input as { runId?: unknown }).runId;
            if (typeof runIdValue === 'string') return runIdValue;
          }
          if ('run_id' in input) {
            const runIdValue = (input as { run_id?: unknown }).run_id;
            if (typeof runIdValue === 'string') return runIdValue;
          }
        }
      }
      if (!('event' in payload)) return null;
      const event = (payload as { event?: unknown }).event;
      if (typeof event !== 'object' || event === null) return null;
      if ('runId' in event) {
        const runIdValue = (event as { runId?: unknown }).runId;
        if (typeof runIdValue === 'string') return runIdValue;
      }
      if ('run_id' in event) {
        const runIdValue = (event as { run_id?: unknown }).run_id;
        if (typeof runIdValue === 'string') return runIdValue;
      }
      return null;
    };

    const isCurrentThreadEvent = (payload: unknown): boolean => {
      const inputThreadId = getInputThreadId(payload);
      const currentThreadId = threadIdRef.current;
      if (!inputThreadId || !currentThreadId) return true;
      return inputThreadId === currentThreadId;
    };

    const rememberActiveRun = (payload: unknown) => {
      const runId = getInputRunId(payload);
      const currentThreadId = threadIdRef.current;
      if (!runId || !currentThreadId) return;
      activeRunRef.current = {
        threadId: currentThreadId,
        runId,
      };
    };

    const isCurrentRunEvent = (payload: unknown): boolean => {
      if (!isCurrentThreadEvent(payload)) return false;
      const currentThreadId = threadIdRef.current;
      const runId = getInputRunId(payload);
      if (!runId || !currentThreadId) return true;
      const activeRun = activeRunRef.current;
      if (activeRun.threadId !== currentThreadId || !activeRun.runId) {
        return true;
      }
      return activeRun.runId === runId;
    };

    const shouldApplyRunScopedState = (payload: unknown): boolean => {
      if (!isCurrentThreadEvent(payload)) return false;
      const currentThreadId = threadIdRef.current;
      const runId = getInputRunId(payload);
      if (!runId || !currentThreadId) return true;
      const activeRun = activeRunRef.current;
      if (activeRun.threadId !== currentThreadId || !activeRun.runId) {
        rememberActiveRun(payload);
        return true;
      }
      return activeRun.runId === runId;
    };

    const clearRunFlag = (payload?: unknown) => {
      if (!isCurrentRunEvent(payload)) return;
      commandSchedulerRef.current?.handleRunTerminal();
    };

    const applyProjectedState = (statePayload: unknown) => {
      emitConnectTrace('state-apply-attempt', {
        currentThreadId: threadIdRef.current ?? null,
        appliedMutationId: extractAppliedMutationId(statePayload),
        stateKeys:
          typeof statePayload === 'object' && statePayload !== null
            ? Object.keys(statePayload as Record<string, unknown>).slice(0, 20)
            : null,
        hasTopLevelTasks:
          typeof statePayload === 'object' &&
          statePayload !== null &&
          Array.isArray((statePayload as { tasks?: unknown[] }).tasks),
        topLevelTaskCount:
          typeof statePayload === 'object' &&
          statePayload !== null &&
          Array.isArray((statePayload as { tasks?: unknown[] }).tasks)
            ? (statePayload as { tasks: unknown[] }).tasks.length
            : null,
      });
      const appliedMutationId = extractAppliedMutationId(statePayload);
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
      const previousState = hasStateValues(agent.state) ? (agent.state as ThreadSnapshot) : null;
      const projectedState = projectDetailStateFromPayload(statePayload, previousState);
      if (projectedState) {
        const previousThread = previousState?.thread;
        const projectedThread = projectedState.thread;

        logConnectEvent('state-applied', {
          agentId,
          threadId: threadIdRef.current,
          previousTaskState: previousThread?.task?.taskStatus?.state,
          nextTaskState: projectedThread?.task?.taskStatus?.state,
          previousOnboardingStatus: previousThread?.onboardingFlow?.status,
          nextOnboardingStatus: projectedThread?.onboardingFlow?.status,
        });
        emitConnectTrace('state-apply-success', {
          currentThreadId: threadIdRef.current ?? null,
          previousTaskId: previousThread?.task?.id ?? null,
          nextTaskId: projectedThread?.task?.id ?? null,
          previousTaskState: previousThread?.task?.taskStatus?.state ?? null,
          nextTaskState: projectedThread?.task?.taskStatus?.state ?? null,
          previousEventCount: previousThread?.activity?.events?.length ?? null,
          nextEventCount: projectedThread?.activity?.events?.length ?? null,
          nextTopLevelTaskCount: Array.isArray(projectedState.tasks) ? projectedState.tasks.length : null,
        });
        agent.setState(projectedState);
        return;
      }

      emitConnectTrace('state-apply-noop', {
        reason: 'no-projected-state-existing-state-kept',
        currentThreadId: threadIdRef.current ?? null,
      });
    };

    const extractSnapshotState = (payload: unknown): unknown => {
      if (typeof payload !== 'object' || payload === null) return null;
      if (!('event' in payload)) return null;
      const event = (payload as { event?: unknown }).event;
      if (typeof event !== 'object' || event === null) return null;
      if (!('snapshot' in event)) return null;
      return (event as { snapshot?: unknown }).snapshot ?? null;
    };

    const applyMessages = (nextMessages: unknown, options?: { resetVisibleOrder?: boolean }) => {
      const normalized = Array.isArray(nextMessages) ? (nextMessages as Message[]) : [];
      const previousState = hasStateValues(agent.state) ? (agent.state as ThreadSnapshot) : initialAgentState;
      const previousMessages = Array.isArray(previousState.messages)
        ? (previousState.messages as Message[])
        : [];
      if (messagesEqual(previousMessages, normalized)) {
        return;
      }
      if (options?.resetVisibleOrder) {
        setMessageSnapshotEpoch((current) => current + 1);
      }
      agent.setState({
        ...previousState,
        messages: normalized,
      });
    };

    const subscription = agent.subscribe({
      onRunStartedEvent: (payload) => {
        if (!isCurrentThreadEvent(payload)) return;
        rememberActiveRun(payload);
        setRunInFlight(true);
      },
      onRunFinishedEvent: (payload) => clearRunFlag(payload),
      onRunErrorEvent: (payload) => clearRunFlag(payload),
      onRunFailed: (payload) => clearRunFlag(payload),
      onRunFinalized: (payload) => clearRunFlag(payload),
      onRunInitialized: (payload) => {
        const accepted = isCurrentThreadEvent(payload);
        emitConnectTrace('run-initialized', {
          accepted,
          inputThreadId: getInputThreadId(payload),
          inputRunId: getInputRunId(payload),
          currentThreadId: threadIdRef.current ?? null,
          activeRunThreadId: activeRunRef.current.threadId ?? null,
          activeRunId: activeRunRef.current.runId ?? null,
        });
        if (!accepted) return;
        rememberActiveRun(payload);
        applyProjectedState(payload.state);
      },
      onStateSnapshotEvent: (payload) => {
        const accepted = shouldApplyRunScopedState(payload);
        emitConnectTrace('state-snapshot-event', {
          accepted,
          inputThreadId: getInputThreadId(payload),
          inputRunId: getInputRunId(payload),
          currentThreadId: threadIdRef.current ?? null,
          activeRunThreadId: activeRunRef.current.threadId ?? null,
          activeRunId: activeRunRef.current.runId ?? null,
        });
        if (!accepted) return;
        rememberActiveRun(payload);
        const snapshotState = extractSnapshotState(payload);
        if (!snapshotState) {
          emitConnectTrace('state-snapshot-empty', {
            inputThreadId: getInputThreadId(payload),
            inputRunId: getInputRunId(payload),
          });
          return;
        }
        applyProjectedState(snapshotState);
      },
      onMessagesSnapshotEvent: (payload) => {
        if (!isCurrentThreadEvent(payload)) return;
        emitConnectTrace('messages-snapshot-event', {
          inputThreadId: getInputThreadId(payload),
          inputRunId: getInputRunId(payload),
          currentThreadId: threadIdRef.current ?? null,
        });
        applyMessages(payload.messages, { resetVisibleOrder: true });
      },
      onMessagesChanged: (payload) => {
        if (!isCurrentThreadEvent(payload)) return;
        applyMessages(payload.messages);
      },
    });

    return () => subscription.unsubscribe();
  }, [
    agent,
    agentId,
    emitConnectTrace,
    extractAppliedMutationId,
    hasStateValues,
    logConnectEvent,
    setRunInFlight,
  ]);

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
      setRunInFlight,
      runAgent: async (currentAgent) => runAgentOnCurrentThread(currentAgent),
      createId: v7,
      isBusyRunError,
      isAbortLikeError,
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
          source: 'agent-command',
          agentId,
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
        const detail = error instanceof Error ? error.message : String(error);
        console.error('[useAgentConnection] Agent command failed', {
          source: 'agent-command',
          agentId,
          command,
          threadId: threadIdRef.current,
          detail,
          error,
        });
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
  }, [agentId, copilotkit, runAgentOnCurrentThread, setRunInFlight]);

  useEffect(() => {
    const ownerId = streamOwnerIdRef.current;
    if (!ownerId) return undefined;

    registerAgentStreamOwner(ownerId, async () => {
      const currentAgent = agentRef.current;

      if (!currentAgent) {
        logConnectEvent('preempt-cleanup-agent-missing', {
          agentId,
          threadId: threadIdRef.current ?? lastConnectedThreadRef.current ?? null,
        });
      }

      logConnectEvent('preempt-cleanup', {
        agentId,
        agent: getAgentDebugId(currentAgent),
      });
      if (currentAgent) {
        await cleanupAgentConnection(currentAgent);
      }

      const disconnectThreadId =
        currentAgent?.threadId ?? threadIdRef.current ?? lastConnectedThreadRef.current ?? null;
      await disconnectRuntimeStream({
        threadId: disconnectThreadId,
        agent: getAgentDebugId(currentAgent),
        reason: 'owner-preempt',
      });
    });

    return () => {
      void releaseAgentStreamOwner(ownerId);
      void unregisterAgentStreamOwner(ownerId);
    };
  }, [agentId, disconnectRuntimeStream, getAgentDebugId, logConnectEvent]);

  useEffect(() => {
    if (!agent) return undefined;
    const ownerId = streamOwnerIdRef.current;

    return () => {
      logConnectEvent('cleanup', {
        agentId,
        agent: getAgentDebugId(agent),
        threadId,
      });

      // Active-owner cleanup is handled by stream coordinator release/unregister.
      // Only cleanup here when this captured agent instance is stale.
      if (agentRef.current !== agent) {
        void cleanupAgentConnection(agent);
      } else if (ownerId) {
        void releaseAgentStreamOwner(ownerId);
      }

      const disconnectThreadId =
        agent.threadId ?? threadId ?? threadIdRef.current ?? lastConnectedThreadRef.current ?? null;
      void disconnectRuntimeStream({
        threadId: disconnectThreadId,
        agent: getAgentDebugId(agent),
        reason: 'effect-cleanup',
      });
    };
  }, [agent, agentId, disconnectRuntimeStream, getAgentDebugId, logConnectEvent, threadId]);

  useEffect(() => {
    setRunInFlight(false);
    lastConnectedThreadRef.current = null;
    activeRunRef.current = { threadId, runId: null };
    commandSchedulerRef.current?.reset();
    clearConnectRetryTimer();
  }, [threadId, clearConnectRetryTimer, setRunInFlight]);

  useEffect(() => {
    emitConnectTrace('runtime-status', {
      agent: getAgentDebugId(agent),
      runtimeStatus,
    });
  }, [agent, emitConnectTrace, getAgentDebugId, runtimeStatus]);

  useEffect(() => {
    if (!agent) return;
    if (runtimeStatus === CopilotKitCoreRuntimeConnectionStatus.Connected) return;
    if (!lastConnectedThreadRef.current) return;

    const ownerId = streamOwnerIdRef.current;
    if (ownerId) {
      void releaseAgentStreamOwner(ownerId);
    }

    logConnectEvent('runtime-disconnected-cleanup', {
      agentId,
      agent: getAgentDebugId(agent),
      threadId: lastConnectedThreadRef.current,
      runtimeStatus,
    });
    emitConnectTrace('runtime-disconnected-cleanup', {
      agent: getAgentDebugId(agent),
      threadId: lastConnectedThreadRef.current,
      runtimeStatus,
    });

    lastConnectedThreadRef.current = null;
    clearConnectRetryTimer();
  }, [
    agent,
    runtimeStatus,
    agentId,
    clearConnectRetryTimer,
    emitConnectTrace,
    getAgentDebugId,
    logConnectEvent,
  ]);

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
      disconnectRequestKeyRef.current = null;

      const hasConnectAgent = typeof currentAgent.connectAgent === 'function';

      logConnectEvent('start', {
        agentId,
        seq: connectSeq,
        threadId,
        agent: getAgentDebugId(currentAgent),
        hasConnectAgent,
      });
      emitConnectTrace('connect-start', {
        seq: connectSeq,
        agent: getAgentDebugId(currentAgent),
        hasConnectAgent,
      });

      void copilotkit.connectAgent({ agent: currentAgent }).catch((error: unknown) => {
        emitConnectTrace('connect-error', {
          seq: connectSeq,
          agent: getAgentDebugId(currentAgent),
          error: error instanceof Error ? error.message : String(error),
          busy: isBusyRunError(error),
          canceled,
        });
        if (!isBusyRunError(error) || canceled) {
          return;
        }

        lastConnectedThreadRef.current = null;
        clearConnectRetryTimer();
        connectRetryTimeoutRef.current = setTimeout(() => {
          connectRetryTimeoutRef.current = null;
          setConnectRetryTick((value) => value + 1);
        }, CONNECT_BUSY_RETRY_MS);
      });
    };

    void connectOnly();

    return () => {
      canceled = true;
      clearConnectRetryTimer();
      logConnectEvent('effect-cleanup', {
        agentId,
        seq: connectSeq,
        threadId,
        agent: getAgentDebugId(agentRef.current),
      });
      emitConnectTrace('connect-effect-cleanup', {
        seq: connectSeq,
        agent: getAgentDebugId(agentRef.current),
      });
      void releaseAgentStreamOwner(ownerId);
    };
  }, [
    threadId,
    agent,
    runtimeStatus,
    connectRetryTick,
    copilotkit,
    agentId,
    clearConnectRetryTimer,
    emitConnectTrace,
    getAgentDebugId,
    logConnectEvent,
  ]);

  // Extract state with defaults
  const currentState =
    agent.state && Object.keys(agent.state).length > 0
      ? (agent.state as ThreadSnapshot)
      : initialAgentState;
  const threadState = currentState.thread ?? defaultThreadState;
  const syncRunPending = syncingState.threadId === threadId ? syncingState.isSyncing : false;
  const pendingSyncMutationId =
    pendingSyncMutationByThread.threadId === threadId
      ? pendingSyncMutationByThread.clientMutationId
      : null;
  const isSyncing = syncRunPending || pendingSyncMutationId !== null;
  const hasLoadedView = !needsSync(currentState);
  const uiState: UiState = deriveUiState({
    threadState,
    runtime: {
      isConnected: runtimeStatus === CopilotKitCoreRuntimeConnectionStatus.Connected,
      hasLoadedSnapshot: hasLoadedView,
      commandInFlight: isHiring || isFiring || isSyncing,
      syncPending: isSyncing,
      pendingSyncMutationId,
    },
  });
  const profile = uiState.profile ?? defaultProfile;
  const metrics = uiState.metrics ?? defaultMetrics;
  const activity = uiState.activity ?? defaultActivity;
  const transactionHistory = uiState.transactionHistory ?? [];
  const events = activity.events ?? [];
  const eventCount = events.length;
  const latestEvent = eventCount > 0 ? events[eventCount - 1] : null;
  const latestEventId =
    latestEvent?.type === 'status'
      ? latestEvent.task.id
      : latestEvent?.type === 'artifact'
        ? latestEvent.artifact.id ?? latestEvent.artifact.artifactId ?? null
        : latestEvent?.type === 'dispatch-response'
          ? latestEvent.parts[0]?.kind ?? null
          : null;
  const settings = currentState.settings ?? defaultSettings;
  const messages = useMemo(
    () => (Array.isArray(currentState.messages) ? (currentState.messages as Message[]) : []),
    [currentState.messages],
  );
  const syncedPendingInterrupt = deriveSyncedInterrupt(currentState);
  useEffect(() => {
    emitConnectTrace('state-applied', {
      taskId: threadState.task?.id ?? null,
      taskState: threadState.task?.taskStatus.state ?? null,
      taskMessage:
        typeof threadState.task?.taskStatus.message === 'string'
          ? threadState.task.taskStatus.message
          : null,
      activityEventCount: eventCount,
      latestEventId,
      executionError: threadState.executionError ?? null,
      haltReason: threadState.haltReason ?? null,
    });
  }, [
    eventCount,
    emitConnectTrace,
    latestEventId,
    threadState.executionError,
    threadState.haltReason,
    threadState.task?.id,
    threadState.task?.taskStatus.message,
    threadState.task?.taskStatus.state,
  ]);

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

  const profileWithFallback: ThreadProfile = {
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
  const isHired = uiState.selectors.isHired;
  const isActive = uiState.selectors.isActive;

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

      setIsHiring(true);
      setTimeout(() => setIsHiring(false), 5000);
    }
  }, [isHired, isHiring, runCommand]);

  const runFire = useCallback(() => {
    if (isFiring) return;

    logFireCommandDebug('runFire invoked', {
      threadId,
      runInFlight: runInFlightRef.current,
    });
    setUiError(null);
    setIsFiring(true);

    const scheduler = commandSchedulerRef.current;
    if (!scheduler) {
      logFireCommandDebug('scheduler missing', {
        threadId,
      });
      setUiError('Unable to submit fire command right now. Please retry.');
      setIsFiring(false);
      return;
    }

    const accepted = scheduler.dispatchCustom({
      command: 'fire',
      allowPreemptive: true,
      run: async (value) => {
        logFireCommandDebug('custom dispatch run start', {
          threadId,
          runInFlight: runInFlightRef.current,
        });
        const ok = await fireAgentRun({
          agent: value,
          runAgent: async (current) => runAgentOnCurrentThread(current),
          runDirectCommand: async (current, commandName) =>
            runAgentOnCurrentThread(current, {
              forwardedProps: {
                command: {
                  name: commandName,
                },
              },
            }),
          preemptActiveRun: async (current) => copilotkit.stopAgent({ agent: current }),
          threadId,
          runInFlightRef,
          createId: v7,
          commandTransport: config.imperativeCommandTransport,
          onError: (message) => {
            setUiError(message);
            setIsFiring(false);
          },
        });

        if (!ok) {
          logFireCommandDebug('custom dispatch returned false', {
            threadId,
          });
          setUiError('Unable to submit fire command right now. Please retry.');
          setIsFiring(false);
          return;
        }
        logFireCommandDebug('custom dispatch completed', {
          threadId,
          runInFlight: runInFlightRef.current,
        });
      },
    });

    logFireCommandDebug('scheduler dispatch result', {
      threadId,
      accepted,
    });
    if (!accepted) {
      setUiError('Unable to submit fire command while another command is active.');
      setIsFiring(false);
      return;
    }

    setTimeout(() => setIsFiring(false), 3000);
  }, [config.imperativeCommandTransport, copilotkit, isFiring, runAgentOnCurrentThread, threadId]);

  const sendChatMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (trimmed.length === 0) {
        return;
      }

      setUiError(null);
      const scheduler = commandSchedulerRef.current;
      if (!scheduler) {
        setUiError('Unable to send a message right now. Please retry.');
        return;
      }

      const messageId = v7();
      const accepted = scheduler.dispatchCustom({
        command: 'chat',
        run: async (currentAgent) => {
          currentAgent.addMessage({
            id: messageId,
            role: 'user',
            content: trimmed,
          });
          await runAgentOnCurrentThread(currentAgent);
        },
      });

      if (accepted) {
        return;
      }

      if (!accepted) {
        setUiError('Unable to send a message while another run is active.');
      }
    },
    [runAgentOnCurrentThread],
  );

  const clearUiError = useCallback(() => setUiError(null), []);
  const effectiveActiveInterrupt = selectActiveInterrupt({
    streamInterrupt: activeInterrupt ?? null,
    syncPendingInterrupt: syncedPendingInterrupt,
    lifecyclePhase: threadState.lifecycle?.phase ?? null,
    hasLoadedSnapshot: hasLoadedView,
  });

  useEffect(() => {
    if (!debugConnect) return;

    emitConnectTrace('interrupt-selection', {
      hasTopLevelTasks: Array.isArray(currentState.tasks),
      topLevelTaskCount: Array.isArray(currentState.tasks) ? currentState.tasks.length : 0,
      taskState: threadState.task?.taskStatus?.state ?? null,
      streamInterruptType: activeInterrupt?.type ?? null,
      syncedInterruptType: syncedPendingInterrupt?.type ?? null,
      effectiveInterruptType: effectiveActiveInterrupt?.type ?? null,
    });
  }, [
    activeInterrupt?.type,
    currentState.tasks,
    debugConnect,
    effectiveActiveInterrupt?.type,
    emitConnectTrace,
    syncedPendingInterrupt?.type,
    threadState.task?.taskStatus?.state,
  ]);

  const resolveInterrupt = useCallback(
    (
      input:
        | OperatorConfigInput
        | PendleSetupInput
        | PortfolioManagerSetupInput
        | GmxSetupInput
        | PiOperatorNoteInput
        | FundWalletAcknowledgement
        | FundingTokenInput
        | DelegationSigningResponse,
    ) => {
      const serializedInput = JSON.stringify(input);
      const interruptType = effectiveActiveInterrupt?.type;
      emitConnectTrace('interrupt-submit-attempt', {
        interruptType: interruptType ?? null,
        runInFlight: runInFlightRef.current,
        hasScheduler: commandSchedulerRef.current !== null,
        payloadLength: serializedInput.length,
      });
      const scheduler = commandSchedulerRef.current;
      if (!scheduler) {
        emitConnectTrace('interrupt-submit-missing-scheduler', {
          interruptType: interruptType ?? null,
          runInFlight: runInFlightRef.current,
        });
        setUiError('Unable to submit onboarding input right now. Please retry.');
        return;
      }

      const accepted = scheduler.dispatchCustom({
        command: 'resume',
        allowPreemptive: true,
        run: async (currentAgent) => {
          emitConnectTrace('interrupt-submit-run-start', {
            interruptType: interruptType ?? null,
            runInFlight: runInFlightRef.current,
          });
          const resumed = await resumeInterruptViaAgent({
            agent: currentAgent,
            resumePayload: serializedInput,
            runResume: ({ agent: resumeAgent, payload }) =>
              runAgentOnCurrentThread(resumeAgent, {
                forwardedProps: payload.forwardedProps,
              }),
          });
          if (!resumed) {
            emitConnectTrace('interrupt-submit-run-returned-false', {
              interruptType: interruptType ?? null,
            });
            throw new Error('Unable to submit onboarding input right now. Please retry.');
          }
          emitConnectTrace('interrupt-submit-run-complete', {
            interruptType: interruptType ?? null,
          });
          scheduleCycleAfterInterruptResolution({
            interruptType,
            runCommand,
          });
        },
      });

      if (!accepted) {
        emitConnectTrace('interrupt-submit-scheduler-rejected', {
          interruptType: interruptType ?? null,
          runInFlight: runInFlightRef.current,
        });
        setUiError('Unable to submit onboarding input right now. Please retry.');
        return;
      }

      emitConnectTrace('interrupt-submit-dispatched', {
        interruptType: interruptType ?? null,
        runInFlight: runInFlightRef.current,
      });
    },
    [effectiveActiveInterrupt?.type, emitConnectTrace, runAgentOnCurrentThread, runCommand],
  );

  // Local settings mutation helper; caller decides whether to enqueue a sync run.
  const updateSettings = useCallback(
    (updates: Partial<AgentSettings>) => {
      const currentAgent = agentRef.current;
      if (!currentAgent) return;

      const nextState =
        hasStateValues(currentAgent.state) ? (currentAgent.state as ThreadSnapshot) : initialAgentState;

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
    uiState,
    profile: profileWithFallback,
    metrics,
    activity,
    transactionHistory,
    events,
    messages,
    messageSnapshotEpoch,
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
    sendChatMessage,
    resolveInterrupt,
    updateSettings,
    saveSettings,
  };
}
