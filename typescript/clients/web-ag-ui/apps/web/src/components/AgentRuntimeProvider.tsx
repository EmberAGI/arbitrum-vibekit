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
import { getAgentThreadId, resolveAgentThreadWalletAddress } from '../utils/agentThread';

function AgentListRuntimeBridge() {
  const agent = useAgent();
  const { upsertAgent } = useAgentList();
  const lastSnapshotRef = useRef<string | null>(null);
  const debugStatus = process.env.NEXT_PUBLIC_AGENT_STATUS_DEBUG === 'true';

  const { uiState, config } = agent;
  const agentId = config.id;

  useEffect(() => {
    if (!agentId || agentId === 'inactive-agent') return;

    const update = projectAgentListUpdate({
      profile: uiState.profile,
      metrics: uiState.metrics,
      task: uiState.task,
      haltReason: uiState.haltReason,
      executionError: uiState.executionError,
    });
    const snapshotKey = JSON.stringify(update);
    if (snapshotKey === lastSnapshotRef.current) {
      return;
    }
    lastSnapshotRef.current = snapshotKey;

    if (debugStatus) {
      console.debug('[AgentListRuntimeBridge] upsert detail-connect', {
        agentId,
        taskId: update.taskId,
        taskState: update.taskState,
        taskMessage: update.taskMessage,
        haltReason: update.haltReason,
        executionError: update.executionError,
      });
    }

    upsertAgent(agentId, update, 'detail-connect');
  }, [
    agentId,
    debugStatus,
    upsertAgent,
    uiState.executionError,
    uiState.haltReason,
    uiState.metrics,
    uiState.profile,
    uiState.task,
  ]);

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

  const threadWalletAddress = resolveAgentThreadWalletAddress(privyWallet?.address);

  if (!agentId) {
    return <InactiveAgentProvider>{children}</InactiveAgentProvider>;
  }

  const threadId = getAgentThreadId(agentId, threadWalletAddress);

  if (!threadId) {
    return <InactiveAgentProvider>{children}</InactiveAgentProvider>;
  }

  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      useSingleEndpoint
      agent={agentId}
      threadId={threadId}
      key={threadId}
    >
      <AgentProvider agentId={agentId}>
        <AgentListRuntimeBridge />
        {children}
      </AgentProvider>
    </CopilotKit>
  );
}
