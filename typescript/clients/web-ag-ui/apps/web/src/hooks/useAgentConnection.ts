'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useCoAgent, useCopilotContext } from '@copilotkit/react-core';
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

  // Track whether a command is currently in-flight to prevent 409 errors
  const isBusyRef = useRef(false);
  const pendingCommandRef = useRef<string | null>(null);
  const initialSyncDoneRef = useRef(false);

  const config = getAgentConfig(agentId);

  const { state, setState, run } = useCoAgent<AgentState>({
    name: agentId,
    initialState: initialAgentState,
  });
  const { threadId } = useCopilotContext();

  const { activeInterrupt, resolve } = useLangGraphInterruptCustomUI<AgentInterrupt>({
    enabled: isAgentInterrupt,
  });

  // Safe run wrapper that prevents concurrent commands
  const safeRunRef = useRef<
    ((command: string, onStart?: () => void, onComplete?: () => void) => void) | undefined
  >(undefined);

  const safeRun = useCallback(
    (command: string, onStart?: () => void, onComplete?: () => void) => {
      if (isBusyRef.current) {
        pendingCommandRef.current = command;
        return;
      }

      isBusyRef.current = true;
      onStart?.();

      run(() => ({
        id: v7(),
        role: 'user',
        content: JSON.stringify({ command }),
      }));

      // Reset busy state after a delay to allow next command
      setTimeout(() => {
        isBusyRef.current = false;
        onComplete?.();

        // Process any pending command
        const pending = pendingCommandRef.current;
        if (pending) {
          pendingCommandRef.current = null;
          safeRunRef.current?.(pending);
        }
      }, 1500);
    },
    [run],
  );

  // Keep ref in sync with latest safeRun
  useEffect(() => {
    safeRunRef.current = safeRun;
  }, [safeRun]);

  // Initial sync when thread is established (only once)
  useEffect(() => {
    if (threadId && !initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true;
      // Delay initial sync slightly to avoid race with any immediate user action
      const timer = setTimeout(() => {
        safeRun('sync');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [threadId, safeRun]);

  // Extract state with defaults
  const view = state?.view ?? defaultView;
  const profile = view.profile ?? defaultProfile;
  const metrics = view.metrics ?? defaultMetrics;
  const activity = view.activity ?? defaultActivity;
  const transactionHistory = view.transactionHistory ?? [];
  const events = activity.events ?? [];
  const settings = state?.settings ?? defaultSettings;

  // Derived state
  const isHired = view.command === 'hire' || view.command === 'run' || view.command === 'cycle';
  const isActive = view.command !== undefined && view.command !== 'idle' && view.command !== 'fire';

  const runSync = useCallback(() => {
    safeRun(
      'sync',
      () => setIsSyncing(true),
      () => setIsSyncing(false),
    );
  }, [safeRun]);

  const runHire = useCallback(() => {
    if (!isHired && !isHiring) {
      safeRun(
        'hire',
        () => setIsHiring(true),
        () => setIsHiring(false),
      );
    }
  }, [safeRun, isHired, isHiring]);

  const runFire = useCallback(() => {
    if (!isFiring) {
      safeRun(
        'fire',
        () => setIsFiring(true),
        () => setIsFiring(false),
      );
    }
  }, [safeRun, isFiring]);

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

  // Settings sync pattern: update local state, then run sync command to merge to backend
  const updateSettings = useCallback(
    (updates: Partial<AgentSettings>) => {
      setState((prev) => ({
        ...(prev ?? initialAgentState),
        settings: {
          ...(prev?.settings ?? defaultSettings),
          ...updates,
        },
      }));

      // Run sync command to merge local state changes to backend
      safeRun('sync');
    },
    [setState, safeRun],
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
