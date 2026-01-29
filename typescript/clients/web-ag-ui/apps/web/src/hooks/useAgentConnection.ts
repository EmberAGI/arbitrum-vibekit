'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useCopilotContext } from '@copilotkit/react-core';
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
  type FundingTokenInput,
  type DelegationSigningResponse,
  type Transaction,
  type ClmmEvent,
  defaultView,
  defaultProfile,
  defaultMetrics,
  defaultActivity,
  defaultSettings,
  initialAgentState,
} from '../types/agent';

export type {
  AgentState,
  AgentView,
  AgentViewProfile,
  AgentViewMetrics,
  AgentViewActivity,
  AgentSettings,
  AgentInterrupt,
  OperatorConfigInput,
  FundingTokenInput,
  Transaction,
  ClmmEvent,
};

const isAgentInterrupt = (value: unknown): value is AgentInterrupt =>
  typeof value === 'object' &&
  value !== null &&
  ((value as { type?: string }).type === 'operator-config-request' ||
    (value as { type?: string }).type === 'clmm-funding-token-request' ||
    (value as { type?: string }).type === 'clmm-delegation-signing-request');

export interface UseAgentConnectionResult {
  config: AgentConfig;
  isConnected: boolean;
  threadId: string | undefined;

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
      | FundingTokenInput
      | DelegationSigningResponse
      | { [key: string]: unknown },
  ) => void;

  // Settings management: updates local state then syncs to backend
  updateSettings: (updates: Partial<AgentSettings>) => void;
}

export function useAgentConnection(agentId: string): UseAgentConnectionResult {
  const [isHiring, setIsHiring] = useState(false);
  const [isFiring, setIsFiring] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncedAgentRef = useRef<unknown>(null);
  const agentRef = useRef<ReturnType<typeof useAgent>['agent'] | null>(null);

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

  // Simple command runner - no queuing, just run the command
  const runCommand = useCallback(
    (command: string) => {
      if (!agent) return;
      void copilotkit.runAgent({
        agent,
        withMessages: [
          {
            id: v7(),
            role: 'user',
            content: JSON.stringify({ command }),
          },
        ],
      });
    },
    [agent, copilotkit],
  );

  const hasStateValues = useCallback((value: unknown): value is AgentState => {
    return Boolean(value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0);
  }, []);

  useEffect(() => {
    if (!agent) {
      return undefined;
    }

    const subscription = agent.subscribe({
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
    });

    return () => subscription.unsubscribe();
  }, [agent, hasStateValues]);

  // Initial sync when thread is established - runs once per agent instance
  useEffect(() => {
    agentRef.current = agent ?? null;
  }, [agent]);

  useEffect(() => {
    if (!threadId || !agent) return;
    if (runtimeStatus !== CopilotKitCoreRuntimeConnectionStatus.Connected) return;
    if (lastSyncedAgentRef.current === agent) return;

    let cancelled = false;

    const connectAndSync = async () => {
      const currentAgent = agentRef.current;
      if (!currentAgent) return;
      currentAgent.threadId = threadId;

      try {
        await copilotkit.connectAgent({ agent: currentAgent });
      } catch (error) {
        // Errors are already reported via CopilotKit core subscribers.
      }

      if (cancelled) return;
      runCommand('sync');
      lastSyncedAgentRef.current = agent;
    };

    void connectAndSync();

    return () => {
      cancelled = true;
    };
  }, [threadId, agent, runtimeStatus, copilotkit, runCommand]);

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
    setIsSyncing(true);
    runCommand('sync');
    setTimeout(() => setIsSyncing(false), 2000);
  }, [runCommand]);

  const runHire = useCallback(() => {
    if (!isHired && !isHiring) {
      setIsHiring(true);
      runCommand('hire');
      setTimeout(() => setIsHiring(false), 5000);
    }
  }, [runCommand, isHired, isHiring]);

  const runFire = useCallback(() => {
    if (!isFiring) {
      setIsFiring(true);
      runCommand('fire');
      setTimeout(() => setIsFiring(false), 3000);
    }
  }, [runCommand, isFiring]);

  const resolveInterrupt = useCallback(
    (
      input:
        | OperatorConfigInput
        | FundingTokenInput
        | DelegationSigningResponse
        | { [key: string]: unknown },
    ) => {
      resolve(JSON.stringify(input));
    },
    [resolve],
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
