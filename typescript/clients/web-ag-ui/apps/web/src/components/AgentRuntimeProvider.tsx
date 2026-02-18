'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { CopilotKit } from '@copilotkit/react-core';

import { isRegisteredAgentId } from '../config/agents';
import { AgentProvider, InactiveAgentProvider, useAgent } from '../contexts/AgentContext';
import { projectAgentListUpdate } from '../contexts/agentListProjection';
import { useAgentList } from '../contexts/AgentListContext';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';
import { getAgentThreadId } from '../utils/agentThread';

function AgentListRuntimeBridge() {
  const agent = useAgent();
  const { upsertAgent } = useAgentList();
  const lastSnapshotRef = useRef<string | null>(null);

  const { view, config } = agent;
  const agentId = config.id;

  useEffect(() => {
    if (!agentId || agentId === 'inactive-agent') return;

    const update = projectAgentListUpdate({
      command: view.command,
      profile: view.profile,
      metrics: view.metrics,
      task: view.task,
      haltReason: view.haltReason,
      executionError: view.executionError,
    });
    const snapshotKey = JSON.stringify(update);
    if (snapshotKey === lastSnapshotRef.current) {
      return;
    }
    lastSnapshotRef.current = snapshotKey;

    upsertAgent(agentId, update, 'detail-connect');
  }, [agentId, upsertAgent, view.command, view.executionError, view.haltReason, view.metrics, view.profile, view.task]);

  return null;
}

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
  const { privyWallet } = usePrivyWalletClient();

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

  const threadId = getAgentThreadId(agentId, privyWallet?.address);

  if (!threadId) {
    return <InactiveAgentProvider>{children}</InactiveAgentProvider>;
  }

  return (
    <CopilotKit runtimeUrl="/api/copilotkit" useSingleEndpoint agent={agentId} threadId={threadId} key={threadId}>
      <AgentProvider agentId={agentId}>
        <AgentListRuntimeBridge />
        {children}
      </AgentProvider>
    </CopilotKit>
  );
}
