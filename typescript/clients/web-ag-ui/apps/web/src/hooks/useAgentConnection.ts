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
  type AgentInterrupt,
  type OperatorConfigInput,
  type FundingTokenInput,
  type DelegationSigningResponse,
  type Transaction,
  defaultView,
  defaultProfile,
  defaultMetrics,
  defaultActivity,
  initialAgentState,
} from '../types/agent';

export type {
  AgentState,
  AgentView,
  AgentViewProfile,
  AgentViewMetrics,
  AgentViewActivity,
  AgentInterrupt,
  OperatorConfigInput,
  FundingTokenInput,
  Transaction,
};

const isAgentInterrupt = (value: unknown): value is AgentInterrupt =>
  typeof value === 'object' &&
  value !== null &&
  ((value as { type?: string }).type === 'operator-config-request' ||
    (value as { type?: string }).type === 'clmm-funding-token-request' ||
    (value as { type?: string }).type === 'clmm-delegation-signing-request'||
    (value as { type?: string }).type === 'gmx-delegation-signing-request');

export interface UseAgentConnectionResult {
  config: AgentConfig;
  isConnected: boolean;

  view: AgentView;
  profile: AgentViewProfile;
  metrics: AgentViewMetrics;
  activity: AgentViewActivity;
  transactionHistory: Transaction[];
  settings: NonNullable<AgentState['settings']>;

  isHired: boolean;
  isActive: boolean;
  isHiring: boolean;
  isFiring: boolean;

  activeInterrupt: AgentInterrupt | null;

  runHire: () => void;
  runFire: () => void;
  runSync: () => void;
  resolveInterrupt: (
    input: OperatorConfigInput | FundingTokenInput | DelegationSigningResponse | { [key: string]: unknown },
  ) => void;
  updateSettings: (amount: number) => void;
}

export function useAgentConnection(agentId: string): UseAgentConnectionResult {
  const [isHiring, setIsHiring] = useState(false);
  const [isFiring, setIsFiring] = useState(false);

  const config = getAgentConfig(agentId);

  const { state, setState, run } = useCoAgent<AgentState>({
    name: agentId,
    initialState: initialAgentState,
  });
  const { threadId } = useCopilotContext();

  const { activeInterrupt, resolve } = useLangGraphInterruptCustomUI<AgentInterrupt>({
    enabled: isAgentInterrupt,
  });

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

  const view = state?.view ?? defaultView;
  const profile = view.profile ?? defaultProfile;
  const metrics = view.metrics ?? defaultMetrics;
  const activity = view.activity ?? defaultActivity;
  const transactionHistory = view.transactionHistory ?? [];
  const settings = state?.settings ?? { amount: 0 };

  const isHired = view.command === 'hire' || view.command === 'run';
  const isActive = view.command !== 'idle' && view.command !== 'fire';

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
      run(() => ({
        id: v7(),
        role: 'user',
        content: JSON.stringify({ command: 'fire' }),
      }));
      setTimeout(() => setIsFiring(false), 3000);
    }
  }, [run, isFiring]);

  const resolveInterrupt = useCallback(
    (
      input: OperatorConfigInput | FundingTokenInput | DelegationSigningResponse | { [key: string]: unknown },
    ) => {
      resolve(JSON.stringify(input));
    },
    [resolve],
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
