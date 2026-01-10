'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAgentConnection,
  type UseAgentConnectionResult,
} from '../hooks/useAgentConnection';
import { useCurrentAgentId } from '../components/CopilotKitWithDynamicAgent';

// Context value includes the agent connection and a way to switch agents
interface AgentContextValue {
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
function AgentConnectionProvider({
  agentId,
  children,
}: {
  agentId: string;
  children: ReactNode;
}) {
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

export function AgentProvider({ children }: { children: ReactNode }) {
  // Get agent ID from the CopilotKit wrapper (which derives it from URL)
  const currentAgentId = useCurrentAgentId();

  // Key the inner component by agentId to force remount when switching agents
  // This ensures useCoAgent is called fresh with the new agent name
  return (
    <AgentConnectionProvider key={currentAgentId} agentId={currentAgentId}>
      {children}
    </AgentConnectionProvider>
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
