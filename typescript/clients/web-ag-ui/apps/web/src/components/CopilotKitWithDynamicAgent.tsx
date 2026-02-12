'use client';

import { type ReactNode, useMemo, createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotPopup, type CopilotKitCSSProperties } from '@copilotkit/react-ui';
import { DEFAULT_AGENT_ID, AGENT_REGISTRY } from '@/config/agents';

// Context to share the current agent ID with child components
const CurrentAgentContext = createContext<string>(DEFAULT_AGENT_ID);

export function useCurrentAgentId(): string {
  return useContext(CurrentAgentContext);
}

/**
 * CopilotKitWithDynamicAgent
 *
 * This component wraps CopilotKit and dynamically determines the agent
 * based on the current URL path. This is necessary because:
 *
 * 1. CopilotKit's `agent` prop determines which LangGraph backend receives requests
 * 2. When navigating between different agent detail pages (e.g., /hire-agents/agent-clmm
 *    vs /hire-agents/agent-polymarket), we need to route to the correct backend
 * 3. The agent must be determined BEFORE CopilotKit renders to ensure proper routing
 *
 * When a user visits /hire-agents/agent-polymarket, this component extracts
 * "agent-polymarket" from the URL and passes it to CopilotKit, which then routes
 * requests to the polymarket agent backend on port 8127 instead of the default
 * clmm agent on port 8124.
 */
export function CopilotKitWithDynamicAgent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const themeColor = '#fd6731';

  // Extract agent ID from URL path
  // Matches: /hire-agents/agent-clmm, /hire-agents/agent-polymarket, etc.
  const agentId = useMemo(() => {
    const match = pathname?.match(/\/hire-agents\/([^/]+)/);
    console.log('match', match);
    if (match && match[1]) {
      const extractedId = match[1];
      // Validate that this is a known agent
      if (AGENT_REGISTRY[extractedId]) {
        return extractedId;
      }
    }
    return DEFAULT_AGENT_ID;
  }, [pathname]);

  // Use key={agentId} to force CopilotKit to reconnect when switching between agents.
  // This is necessary because:
  // - agent-clmm connects to port 8124
  // - agent-polymarket connects to port 8127
  // Without the key, CopilotKit maintains the old connection and fails to find the agent
  // on the wrong backend ("Agent 'agent-clmm' was not found. Available agents are: agent-polymarket")
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent={agentId} key={agentId}>
      <CurrentAgentContext.Provider value={agentId}>
        <div
          className="contents"
          style={{ '--copilot-kit-primary-color': themeColor } as CopilotKitCSSProperties}
        >
          {children}
        </div>
        {/* Hidden popup for AG-UI interrupt handling */}
        <CopilotPopup defaultOpen={false} clickOutsideToClose={false} />
      </CurrentAgentContext.Provider>
    </CopilotKit>
  );
}
