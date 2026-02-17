'use client';

import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { z } from 'zod';

import { getAllAgents, isRegisteredAgentId } from '../config/agents';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';
import { getAgentThreadId } from '../utils/agentThread';
import type { AgentViewMetrics, AgentViewProfile, TaskState } from '../types/agent';

type AgentListEntry = {
  profile?: AgentViewProfile;
  metrics?: AgentViewMetrics;
  taskId?: string;
  taskState?: TaskState;
  haltReason?: string;
  executionError?: string;
  synced: boolean;
  error?: string;
};

type AgentListState = {
  agents: Record<string, AgentListEntry>;
  upsertAgent: (agentId: string, update: Partial<AgentListEntry>) => void;
};

const AgentListContext = createContext<AgentListState | null>(null);

const SyncResponseSchema = z.object({
  agentId: z.string(),
  profile: z.record(z.unknown()).nullable().optional(),
  metrics: z.record(z.unknown()).nullable().optional(),
  taskId: z.string().nullable().optional(),
  taskState: z.string().nullable().optional(),
  haltReason: z.string().nullable().optional(),
  executionError: z.string().nullable().optional(),
});

function buildInitialState(agentIds: string[]): Record<string, AgentListEntry> {
  return agentIds.reduce<Record<string, AgentListEntry>>((acc, agentId) => {
    acc[agentId] = { synced: false };
    return acc;
  }, {});
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
  if (!candidate) {
    return null;
  }
  const agentId = decodeURIComponent(candidate);
  return isRegisteredAgentId(agentId) ? agentId : null;
}

export function AgentListProvider({ children }: { children: ReactNode }) {
  const agentIds = useMemo(() => getAllAgents().map((agent) => agent.id), []);
  const pathname = usePathname();
  const activeAgentId = useMemo(() => resolveAgentIdFromPath(pathname), [pathname]);
  const { privyWallet } = usePrivyWalletClient();
  const privyAddress = privyWallet?.address ?? null;
  const [agents, setAgents] = useState<Record<string, AgentListEntry>>(() =>
    buildInitialState(agentIds),
  );
  const startedRef = useRef(false);
  const inFlightRef = useRef<Set<string>>(new Set());
  const lastPrivyAddressRef = useRef<string | null>(null);
  const agentsRef = useRef<Record<string, AgentListEntry>>(agents);

  const upsertAgent = useCallback((agentId: string, update: Partial<AgentListEntry>) => {
    setAgents((prev) => ({
      ...prev,
      [agentId]: {
        ...(prev[agentId] ?? { synced: false }),
        ...update,
      },
    }));
  }, []);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    const normalized = privyAddress?.toLowerCase() ?? null;
    if (normalized === lastPrivyAddressRef.current) {
      return;
    }
    lastPrivyAddressRef.current = normalized;
    startedRef.current = false;
    inFlightRef.current = new Set();
    setAgents(buildInitialState(agentIds));
  }, [agentIds, privyAddress]);

  const syncAgent = useCallback(
    async (agentId: string, options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      if (inFlightRef.current.has(agentId)) {
        return;
      }
      if (!force && agentsRef.current[agentId]?.synced) {
        return;
      }

      inFlightRef.current.add(agentId);
      const threadId = getAgentThreadId(agentId, privyAddress);
      if (!threadId) {
        inFlightRef.current.delete(agentId);
        return;
      }

      try {
        const response = await fetch('/api/agents/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, threadId }),
        });

        if (!response.ok) {
          const payload = await response.text();
          throw new Error(`Sync failed (${response.status}): ${payload}`);
        }

        const payload = SyncResponseSchema.safeParse(await response.json().catch(() => null));
        if (!payload.success) {
          throw new Error(`Sync response invalid: ${payload.error.message}`);
        }

        const taskId = payload.data.taskId ?? undefined;
        const hasTask = Boolean(taskId);

        upsertAgent(agentId, {
          synced: true,
          profile: (payload.data.profile ?? undefined) as AgentViewProfile | undefined,
          metrics: (payload.data.metrics ?? undefined) as AgentViewMetrics | undefined,
          taskId,
          taskState: hasTask
            ? ((payload.data.taskState ?? undefined) as TaskState | undefined)
            : undefined,
          haltReason: hasTask ? (payload.data.haltReason ?? undefined) : undefined,
          executionError: hasTask ? (payload.data.executionError ?? undefined) : undefined,
          error: undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[agent-list] Sync failed', { agentId, error: message });
        upsertAgent(agentId, { synced: true, error: message });
      } finally {
        inFlightRef.current.delete(agentId);
      }
    },
    [privyAddress, upsertAgent],
  );

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    if (!privyAddress) {
      return;
    }
    startedRef.current = true;
    agentIds.forEach((agentId) => {
      void syncAgent(agentId);
    });
  }, [agentIds, privyAddress, syncAgent]);

  useEffect(() => {
    const rawInterval = Number(process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_POLL_MS ?? 15000);
    const intervalMs = Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 15000;
    const timer = window.setInterval(() => {
      const current = agentsRef.current;
      Object.entries(current).forEach(([agentId, entry]) => {
        if (activeAgentId && agentId === activeAgentId) {
          return;
        }
        if (!entry.taskState) {
          return;
        }
        if (
          entry.taskState === 'completed' ||
          entry.taskState === 'failed' ||
          entry.taskState === 'canceled'
        ) {
          return;
        }
        void syncAgent(agentId, { force: true });
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [activeAgentId, syncAgent]);

  const value = useMemo(() => ({ agents, upsertAgent }), [agents, upsertAgent]);

  return <AgentListContext.Provider value={value}>{children}</AgentListContext.Provider>;
}

export function useAgentList(): AgentListState {
  const context = useContext(AgentListContext);
  if (!context) {
    throw new Error('useAgentList must be used within an AgentListProvider');
  }
  return context;
}
