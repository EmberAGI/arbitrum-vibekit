'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { CopilotKit } from '@copilotkit/react-core';

import { isRegisteredAgentId } from '../config/agents';
import { AuthoritativeAgentSnapshotCacheProvider } from '../contexts/AuthoritativeAgentSnapshotCache';
import { AgentProvider, InactiveAgentProvider, useAgent } from '../contexts/AgentContext';
import { projectAgentListUpdate } from '../contexts/agentListProjection';
import type { ThreadSnapshot, ThreadState } from '../types/agent';
import { useAgentList } from '../contexts/AgentListContext';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';
import {
  ensureAnonymousAgentThreadId,
  getAgentThreadId,
  resolveAgentThreadWalletAddress,
} from '../utils/agentThread';
import { emitAgentConnectDebug } from '../utils/agentConnectDebug';

type DetailConnectAgentListUpdateInput = {
  uiState: Pick<
    ThreadSnapshot['thread'],
    'lifecycle' | 'onboardingFlow' | 'task' | 'haltReason' | 'executionError'
  >;
  profile: ThreadState['profile'];
  metrics: ThreadState['metrics'];
};

export function projectDetailConnectAgentListUpdate(
  input: DetailConnectAgentListUpdateInput,
) {
  return projectAgentListUpdate({
    lifecycle: input.uiState.lifecycle,
    onboardingFlow: input.uiState.onboardingFlow,
    profile: input.profile,
    metrics: input.metrics,
    task: input.uiState.task,
    haltReason: input.uiState.haltReason,
    executionError: input.uiState.executionError,
  });
}

function AgentListRuntimeBridge() {
  const agent = useAgent();
  const { upsertAgent } = useAgentList();
  const lastSnapshotRef = useRef<string | null>(null);
  const debugStatus = process.env.NEXT_PUBLIC_AGENT_STATUS_DEBUG === 'true';

  const { uiState, config } = agent;
  const agentId = config.id;
  const { lifecycle, onboardingFlow, task, haltReason, executionError, profile, metrics } = uiState;

  useEffect(() => {
    if (!agentId || agentId === 'inactive-agent') return;

    const update = projectDetailConnectAgentListUpdate({
      uiState: {
        lifecycle,
        onboardingFlow,
        task,
        haltReason,
        executionError,
      },
      profile,
      metrics,
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
    executionError,
    haltReason,
    lifecycle,
    metrics,
    onboardingFlow,
    profile,
    task,
    upsertAgent,
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
  const walletThreadId = agentId ? getAgentThreadId(agentId, threadWalletAddress) : null;
  const anonymousThreadId = useMemo(() => {
    if (!agentId || walletThreadId) {
      return null;
    }
    return ensureAnonymousAgentThreadId(agentId);
  }, [agentId, walletThreadId]);

  useEffect(() => {
    emitAgentConnectDebug({
      event: 'runtime-provider-state',
      agentId: agentId ?? 'inactive-agent',
      threadId: walletThreadId ?? anonymousThreadId ?? null,
      payload: {
        pathname,
        privyWalletAddress: privyWallet?.address ?? null,
        threadWalletAddress,
        walletThreadId,
        anonymousThreadId,
        willUseInactiveProvider: !agentId || !(walletThreadId ?? anonymousThreadId),
      },
    });
  }, [
    agentId,
    anonymousThreadId,
    pathname,
    privyWallet?.address,
    threadWalletAddress,
    walletThreadId,
  ]);

  const threadId = walletThreadId ?? anonymousThreadId;
  const content = !agentId || !threadId ? (
    <InactiveAgentProvider>{children}</InactiveAgentProvider>
  ) : (
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

  return (
    <AuthoritativeAgentSnapshotCacheProvider>
      {content}
    </AuthoritativeAgentSnapshotCacheProvider>
  );
}
