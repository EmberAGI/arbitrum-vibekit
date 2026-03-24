'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { Message } from '@ag-ui/core';
import { useAgentConnection, type UseAgentConnectionResult } from '../hooks/useAgentConnection';
import { DEFAULT_AGENT_ID, getAgentConfig } from '../config/agents';
import {
  defaultActivity,
  defaultMetrics,
  defaultProfile,
  defaultSettings,
  defaultUiState,
  initialAgentState,
} from '../types/agent';

const AgentContext = createContext<UseAgentConnectionResult | null>(null);
const emptyMessages: Message[] = [];

const inactiveAgent: UseAgentConnectionResult = {
  config: getAgentConfig('inactive-agent'),
  isConnected: false,
  hasLoadedView: false,
  threadId: undefined,
  interruptRenderer: null,
  uiError: null,
  clearUiError: () => undefined,
  uiState: defaultUiState,
  profile: defaultProfile,
  metrics: defaultMetrics,
  activity: defaultActivity,
  transactionHistory: [],
  events: [],
  messages: Array.isArray(initialAgentState.messages)
    ? (initialAgentState.messages as Message[])
    : emptyMessages,
  settings: defaultSettings,
  isHired: false,
  isActive: false,
  isHiring: false,
  isFiring: false,
  isSyncing: false,
  activeInterrupt: null,
  runHire: () => undefined,
  runFire: () => undefined,
  runSync: () => undefined,
  sendChatMessage: () => undefined,
  resolveInterrupt: () => undefined,
  updateSettings: () => undefined,
  saveSettings: () => undefined,
};

export function AgentProvider({
  children,
  agentId = DEFAULT_AGENT_ID,
}: {
  children: ReactNode;
  agentId?: string;
}) {
  const agent = useAgentConnection(agentId);

  return (
    <AgentContext.Provider value={agent}>
      {children}
      {agent.interruptRenderer}
    </AgentContext.Provider>
  );
}

export function InactiveAgentProvider({ children }: { children: ReactNode }) {
  return <AgentContext.Provider value={inactiveAgent}>{children}</AgentContext.Provider>;
}

export function useAgent(): UseAgentConnectionResult {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
