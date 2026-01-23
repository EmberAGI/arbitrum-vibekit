'use client';

import { createContext, useContext, type ReactNode } from 'react';
import {
  useAgentConnection,
  type UseAgentConnectionResult,
} from '../hooks/useAgentConnection';
import { DEFAULT_AGENT_ID } from '../config/agents';

const AgentContext = createContext<UseAgentConnectionResult | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const agent = useAgentConnection(DEFAULT_AGENT_ID);

  return <AgentContext.Provider value={agent}>{children}</AgentContext.Provider>;
}

export function useAgent(): UseAgentConnectionResult {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}

