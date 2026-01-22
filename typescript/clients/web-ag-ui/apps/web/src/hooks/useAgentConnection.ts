'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAgent } from '@copilotkit/react-core/v2';
import { v5 as uuidv5, v7 as uuidv7 } from 'uuid';
import { useLangGraphInterruptCustomUI } from '../app/hooks/useLangGraphInterruptCustomUI';
import { getAgentConfig, type AgentConfig } from '../config/agents';
import { usePrivyWalletClient } from './usePrivyWalletClient';
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

const THREAD_STORAGE_PREFIX = 'clmm-thread-id';

function buildThreadStorageKey(agentId: string, walletAddress: string): string {
  return `${THREAD_STORAGE_PREFIX}:${agentId}:${walletAddress.toLowerCase()}`;
}

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
  const initialAttachDone = useRef(false);
  const queuedCommands = useRef<string[]>([]);

  const config = getAgentConfig(agentId);

  const { agent } = useAgent({ agentId });
  const { privyWallet } = usePrivyWalletClient();

  const threadId = useMemo(() => {
    if (!privyWallet?.address || typeof window === 'undefined') {
      return undefined;
    }

    const storageKey = buildThreadStorageKey(agentId, privyWallet.address);
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }

    const nextThreadId = uuidv5(
      `${agentId}:${privyWallet.address.toLowerCase()}`,
      uuidv5.URL,
    );
    window.localStorage.setItem(storageKey, nextThreadId);
    return nextThreadId;
  }, [agentId, privyWallet]);

  useEffect(() => {
    if (!threadId) {
      return;
    }
    if (agent.threadId !== threadId) {
      // eslint-disable-next-line react-hooks/immutability -- agent threadId must be set for runtime attachment
      agent.threadId = threadId;
    }
  }, [agent, threadId]);

  useEffect(() => {
    initialAttachDone.current = false;
  }, [threadId]);

  const { activeInterrupt, resolve } = useLangGraphInterruptCustomUI<AgentInterrupt>({
    enabled: isAgentInterrupt,
    agentId,
  });

  const attachToThread = useCallback(() => {
    if (!threadId) {
      return;
    }
    void Promise.resolve(agent.connectAgent?.()).catch(() => undefined);
  }, [agent, threadId]);

  const runCommand = useCallback(
    (command: string) => {
      if (!threadId) {
        return;
      }
      if (agent.isRunning) {
        queuedCommands.current.push(command);
        attachToThread();
        return;
      }
      const message = {
        id: uuidv7(),
        role: 'user' as const,
        content: JSON.stringify({ command }),
      };
      agent.addMessage(message);
      void agent.runAgent();
    },
    [agent, attachToThread, threadId],
  );

  // Attach to the LangGraph thread when threadId becomes available
  useEffect(() => {
    if (!threadId || initialAttachDone.current) {
      return;
    }
    initialAttachDone.current = true;
    attachToThread();
  }, [attachToThread, threadId]);

  useEffect(() => {
    if (!threadId || agent.isRunning || queuedCommands.current.length === 0) {
      return;
    }
    const nextCommand = queuedCommands.current.shift();
    if (!nextCommand) {
      return;
    }
    const message = {
      id: uuidv7(),
      role: 'user' as const,
      content: JSON.stringify({ command: nextCommand }),
    };
    agent.addMessage(message);
    void agent.runAgent();
  }, [agent, agent.isRunning, threadId]);

  // Extract state with defaults
  const state = (agent.state as AgentState | undefined) ?? initialAgentState;
  const view = state.view ?? defaultView;
  const profile = view.profile ?? defaultProfile;
  const metrics = view.metrics ?? defaultMetrics;
  const activity = view.activity ?? defaultActivity;
  const transactionHistory = view.transactionHistory ?? [];
  const events = activity.events ?? [];
  const settings = state.settings ?? defaultSettings;

  // Derived state
  const isHired = view.command === 'hire' || view.command === 'run' || view.command === 'cycle';
  const isActive = view.command !== undefined && view.command !== 'idle' && view.command !== 'fire';

  const runSync = useCallback(() => {
    if (!threadId) {
      return;
    }
    setIsSyncing(true);
    attachToThread();
    setTimeout(() => setIsSyncing(false), 2000);
  }, [attachToThread, threadId]);

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
      const currentState = (agent.state as AgentState | undefined) ?? initialAgentState;
      agent.setState({
        ...currentState,
        settings: {
          ...(currentState.settings ?? defaultSettings),
          ...updates,
        },
      });
    },
    [agent],
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
