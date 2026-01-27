'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  useAgentConnection,
  type UseAgentConnectionResult,
} from '../hooks/useAgentConnection';
import { DEFAULT_AGENT_ID } from '../config/agents';

const AgentContext = createContext<UseAgentConnectionResult | null>(null);

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

export function useAgent(): UseAgentConnectionResult {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
