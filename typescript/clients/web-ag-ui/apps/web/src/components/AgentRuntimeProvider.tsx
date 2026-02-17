'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { CopilotKit } from '@copilotkit/react-core';

import { isRegisteredAgentId } from '../config/agents';
import { AgentProvider, InactiveAgentProvider, useAgent } from '../contexts/AgentContext';
import { useAgentList } from '../contexts/AgentListContext';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';
import type { TaskState } from '../types/agent';
import { getAgentThreadId } from '../utils/agentThread';

function AgentListRuntimeBridge() {
  const agent = useAgent();
  const { upsertAgent } = useAgentList();
  const lastSnapshotRef = useRef<string | null>(null);
  const lastTaskIdRef = useRef<string | undefined>(undefined);

  const { view, config } = agent;
  const agentId = config.id;
  const taskId = view.task?.id;
  const taskState = view.task?.taskStatus?.state as TaskState | undefined;
  const haltReason = view.haltReason;
  const executionError = view.executionError;

  useEffect(() => {
    if (!agentId || agentId === 'inactive-agent') return;

    const hasTask = Boolean(taskId);
    const sanitizedTaskState = hasTask ? taskState : undefined;
    const sanitizedHaltReason = hasTask ? haltReason : undefined;
    const sanitizedExecutionError = hasTask ? executionError : undefined;

    const snapshotKey = JSON.stringify({
      hasTask,
      taskId: hasTask ? taskId : undefined,
      taskState: sanitizedTaskState,
      haltReason: sanitizedHaltReason,
      executionError: sanitizedExecutionError,
    });
    if (snapshotKey === lastSnapshotRef.current) {
      return;
    }
    lastSnapshotRef.current = snapshotKey;

    const hadTask = Boolean(lastTaskIdRef.current);
    const update: {
      synced: boolean;
      taskId?: string;
      taskState?: TaskState;
      haltReason?: string;
      executionError?: string;
    } = { synced: true };

    if (hasTask) {
      update.taskId = taskId;
      update.taskState = sanitizedTaskState;
      update.haltReason = sanitizedHaltReason;
      update.executionError = sanitizedExecutionError;
    } else {
      update.taskId = undefined;
      update.taskState = undefined;
      update.haltReason = undefined;
      update.executionError = undefined;
    }
    if (!hasTask && !hadTask) {
      return;
    }

    upsertAgent(agentId, update);
    lastTaskIdRef.current = hasTask ? taskId : undefined;
  }, [agentId, taskId, taskState, haltReason, executionError, upsertAgent]);

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
    <CopilotKit runtimeUrl="/api/copilotkit" agent={agentId} threadId={threadId} key={threadId}>
      <AgentProvider agentId={agentId}>
        <AgentListRuntimeBridge />
        {children}
      </AgentProvider>
    </CopilotKit>
  );
}
