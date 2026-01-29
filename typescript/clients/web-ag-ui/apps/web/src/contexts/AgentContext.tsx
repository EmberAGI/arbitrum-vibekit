'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  useAgentConnection,
  type UseAgentConnectionResult,
} from '../hooks/useAgentConnection';
import { DEFAULT_AGENT_ID, getAgentConfig } from '../config/agents';
import {
  defaultActivity,
  defaultMetrics,
  defaultProfile,
  defaultSettings,
  defaultView,
} from '../types/agent';

const AgentContext = createContext<UseAgentConnectionResult | null>(null);

const inactiveAgent: UseAgentConnectionResult = {
  config: getAgentConfig('inactive-agent'),
  isConnected: false,
  threadId: undefined,
  interruptRenderer: null,
  view: defaultView,
  profile: defaultProfile,
  metrics: defaultMetrics,
  activity: defaultActivity,
  transactionHistory: [],
  events: [],
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
  resolveInterrupt: () => undefined,
  updateSettings: () => undefined,
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
