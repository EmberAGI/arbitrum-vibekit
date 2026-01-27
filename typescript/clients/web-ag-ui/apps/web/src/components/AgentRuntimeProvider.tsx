'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { CopilotKit } from '@copilotkit/react-core';
import { v5 as uuidv5 } from 'uuid';

import { DEFAULT_AGENT_ID, isRegisteredAgentId } from '../config/agents';
import { AgentProvider } from '../contexts/AgentContext';

const STORAGE_KEY = 'ember-active-agent-id';

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

function readStoredAgentId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeAgentId(agentId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, agentId);
  } catch {
    // ignore write failures
  }
}

export function AgentRuntimeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const agentId = useMemo(() => {
    const pathAgentId = resolveAgentIdFromPath(pathname);
    if (pathAgentId && isRegisteredAgentId(pathAgentId)) {
      return pathAgentId;
    }

    const storedAgentId = readStoredAgentId();
    if (storedAgentId && isRegisteredAgentId(storedAgentId)) {
      return storedAgentId;
    }

    return DEFAULT_AGENT_ID;
  }, [pathname]);

  useEffect(() => {
    const pathAgentId = resolveAgentIdFromPath(pathname);
    if (pathAgentId && isRegisteredAgentId(pathAgentId)) {
      storeAgentId(pathAgentId);
    }
  }, [pathname]);

  const threadId = useMemo(() => {
    return uuidv5(`copilotkit:${agentId}`, uuidv5.URL);
  }, [agentId]);

  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent={agentId} threadId={threadId} key={agentId}>
      <AgentProvider agentId={agentId}>{children}</AgentProvider>
    </CopilotKit>
  );
}
