'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAgentConnection, type UseAgentConnectionResult } from '../hooks/useAgentConnection';
import { DEFAULT_AGENT_ID, getAgentConfig } from '../config/agents';
import {
  defaultActivity,
  defaultMetrics,
  defaultProfile,
  defaultSettings,
  defaultView,
} from '../types/agent';

export interface AgentContextValue {
  agent: UseAgentConnectionResult;
  currentAgentId: string;
  setCurrentAgentId: (id: string) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

/**
 * Inner component that uses useCoAgent via useAgentConnection.
 * This is keyed by agentId to force remount when switching agents,
 * which ensures useCoAgent is called with the correct agent name.
 */
function AgentConnectionProvider({ agentId, children }: { agentId: string; children: ReactNode }) {
  const router = useRouter();

  // Connect to the agent - this component remounts when agentId changes due to key
  const agent = useAgentConnection(agentId);

  // Navigate to a different agent's page (changes URL, which updates context)
  const setCurrentAgentId = useCallback(
    (id: string) => {
      if (id !== agentId) {
        router.push(`/hire-agents/${id}`);
      }
    },
    [agentId, router],
  );

  return (
    <AgentContext.Provider value={{ agent, currentAgentId: agentId, setCurrentAgentId }}>
      {children}
    </AgentContext.Provider>
  );
}

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
  runCommand: () => undefined,
  resolveInterrupt: () => undefined,
  updateSettings: () => undefined,
  setStateFromApiResponse: () => undefined,
};

export function AgentProvider({
  children,
  agentId = DEFAULT_AGENT_ID,
}: {
  children: ReactNode;
  agentId?: string;
}) {
  const agent = useAgentConnection(agentId);
  const router = useRouter();

  const setCurrentAgentId = useCallback(
    (id: string) => {
      if (id !== agentId) {
        router.push(`/hire-agents/${id}`);
      }
    },
    [agentId, router],
  );

  return (
    <AgentContext.Provider value={{ agent, currentAgentId: agentId, setCurrentAgentId }}>
      {children}
      {agent.interruptRenderer}
    </AgentContext.Provider>
  );
}

export function InactiveAgentProvider({ children }: { children: ReactNode }) {
  const setCurrentAgentId = useCallback(() => {
    // No-op for inactive agent
  }, []);

  return (
    <AgentContext.Provider
      value={{
        agent: inactiveAgent,
        currentAgentId: 'inactive-agent',
        setCurrentAgentId,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent(): UseAgentConnectionResult {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context.agent;
}

export function useAgentContext(): AgentContextValue {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgentContext must be used within an AgentProvider');
  }
  return context;
}
