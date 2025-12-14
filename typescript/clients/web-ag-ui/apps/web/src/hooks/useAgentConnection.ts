'use client';

import { useEffect, useState, useCallback } from 'react';
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
  type OperatorInterrupt,
  type OperatorConfigInput,
  type Transaction,
  defaultView,
  defaultProfile,
  defaultMetrics,
  defaultActivity,
  initialAgentState,
} from '../types/agent';

// Re-export types for convenience
export type {
  AgentState,
  AgentView,
  AgentViewProfile,
  AgentViewMetrics,
  AgentViewActivity,
  OperatorInterrupt,
  OperatorConfigInput,
  Transaction,
};

// Type guard for operator config requests
const isOperatorConfigRequest = (value: unknown): value is OperatorInterrupt =>
  typeof value === 'object' &&
  value !== null &&
  (value as { type?: string }).type === 'operator-config-request';

export interface UseAgentConnectionResult {
  // Agent metadata
  config: AgentConfig;

  // Connection state
  isConnected: boolean;

  // Agent state (from CopilotKit)
  view: AgentView;
  profile: AgentViewProfile;
  metrics: AgentViewMetrics;
  activity: AgentViewActivity;
  transactionHistory: Transaction[];
  settings: NonNullable<AgentState['settings']>;

  // Derived state
  isHired: boolean;
  isActive: boolean;

  // Action states
  isHiring: boolean;
  isFiring: boolean;

  // Interrupt handling
  activeInterrupt: OperatorInterrupt | null;

  // Commands
  runHire: () => void;
  runFire: () => void;
  runSync: () => void;
  resolveInterrupt: (input: OperatorConfigInput) => void;
  updateSettings: (amount: number) => void;
}

/**
 * Hook to connect to and manage an agent via CopilotKit.
 * Provides a clean interface for interacting with any configured agent.
 */
export function useAgentConnection(agentId: string): UseAgentConnectionResult {
  const [isHiring, setIsHiring] = useState(false);
  const [isFiring, setIsFiring] = useState(false);

  // Get agent configuration
  const config = getAgentConfig(agentId);

  // Connect to agent via CopilotKit
  const { state, setState, run } = useCoAgent<AgentState>({
    name: agentId,
    initialState: initialAgentState,
  });
  const { threadId } = useCopilotContext();

  // Handle LangGraph interrupts
  const { activeInterrupt, resolve } = useLangGraphInterruptCustomUI<OperatorInterrupt>({
    enabled: isOperatorConfigRequest,
  });

  // Sync state on initial connect
  useEffect(() => {
    if (threadId) {
      run(() => ({
        id: v7(),
        role: 'user',
        content: JSON.stringify({ command: 'sync' }),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Extract state with defaults
  const view = state?.view ?? defaultView;
  const profile = view.profile ?? defaultProfile;
  const metrics = view.metrics ?? defaultMetrics;
  const activity = view.activity ?? defaultActivity;
  const transactionHistory = view.transactionHistory ?? [];
  const settings = state?.settings ?? { amount: 0 };

  // Derived state
  const isHired = view.command === 'hire' || view.command === 'run';
  const isActive = view.command !== 'idle' && view.command !== 'fire';

  // Command handlers
  const runSync = useCallback(() => {
    run(() => ({
      id: v7(),
      role: 'user',
      content: JSON.stringify({ command: 'sync' }),
    }));
  }, [run]);

  const runHire = useCallback(() => {
    if (!isHired && !isHiring) {
      setIsHiring(true);
      run(() => ({
        id: v7(),
        role: 'user',
        content: JSON.stringify({ command: 'hire' }),
      }));
      setTimeout(() => setIsHiring(false), 3000);
    }
  }, [run, isHired, isHiring]);

  const runFire = useCallback(() => {
    if (!isFiring) {
      setIsFiring(true);
      console.log(`[${agentId}] Sending fire command`);
      run(() => ({
        id: v7(),
        role: 'user',
        content: JSON.stringify({ command: 'fire' }),
      }));
      setTimeout(() => setIsFiring(false), 3000);
    }
  }, [run, isFiring, agentId]);

  const resolveInterrupt = useCallback(
    (input: OperatorConfigInput) => {
      console.log(`[${agentId}] Submitting interrupt response:`, input);
      resolve(JSON.stringify(input));
    },
    [resolve, agentId],
  );

  const updateSettings = useCallback(
    (amount: number) => {
      setState((prev) => ({
        ...(prev ?? initialAgentState),
        settings: { ...(prev?.settings ?? initialAgentState.settings), amount },
      }));
    },
    [setState],
  );

  return {
    config,
    isConnected: !!threadId,
    view,
    profile,
    metrics,
    activity,
    transactionHistory,
    settings,
    isHired,
    isActive,
    isHiring,
    isFiring,
    activeInterrupt: activeInterrupt ?? null,
    runHire,
    runFire,
    runSync,
    resolveInterrupt,
    updateSettings,
  };
}
