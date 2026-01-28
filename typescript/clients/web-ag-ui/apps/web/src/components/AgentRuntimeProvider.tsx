'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { CopilotKit } from '@copilotkit/react-core';

import { isRegisteredAgentId } from '../config/agents';
import { AgentProvider, InactiveAgentProvider } from '../contexts/AgentContext';
import { getAgentThreadId } from '../utils/agentThread';

function resolveAgentIdFromPath(pathname: string | null): string | null {
  if (!pathname) {
    return null;
  }
  const segments = pathname.split('/').filter(Boolean);
  const hireIndex = segments.indexOf('hire-agents');
  if (hireIndex === -1) {
    return null;
  }
  const candidate = segments[hireIndex + 1];
  return candidate ? decodeURIComponent(candidate) : null;
}

export function AgentRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const agentId = useMemo(() => {
    const pathAgentId = resolveAgentIdFromPath(pathname);
    if (pathAgentId && isRegisteredAgentId(pathAgentId)) {
      return pathAgentId;
    }
    return null;
  }, [pathname]);

  if (!agentId) {
    return <InactiveAgentProvider>{children}</InactiveAgentProvider>;
  }

  const threadId = getAgentThreadId(agentId);

  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent={agentId} threadId={threadId} key={agentId}>
      <AgentProvider agentId={agentId}>{children}</AgentProvider>
    </CopilotKit>
  );
}
