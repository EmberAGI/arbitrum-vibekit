'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  useAgentConnection,
  type UseAgentConnectionResult,
} from '../hooks/useAgentConnection';
import { DEFAULT_AGENT_ID } from '../config/agents';

// Context value includes the agent connection and a way to switch agents
interface AgentContextValue {
  agent: UseAgentConnectionResult;
  currentAgentId: string;
  setCurrentAgentId: (id: string) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({
  children,
  initialAgentId,
}: {
  children: ReactNode;
  initialAgentId?: string;
}) {
  const [currentAgentId, setCurrentAgentId] = useState(initialAgentId ?? DEFAULT_AGENT_ID);
  const agent = useAgentConnection(currentAgentId);

  return (
    <AgentContext.Provider value={{ agent, currentAgentId, setCurrentAgentId }}>
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
