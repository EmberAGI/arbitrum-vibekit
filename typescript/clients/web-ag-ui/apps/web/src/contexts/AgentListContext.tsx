'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { getAllAgents } from '../config/agents';
import { getAgentThreadId } from '../utils/agentThread';
import type { AgentViewMetrics, AgentViewProfile } from '../types/agent';

type AgentListEntry = {
  profile?: AgentViewProfile;
  metrics?: AgentViewMetrics;
  synced: boolean;
  error?: string;
};

type AgentListState = {
  agents: Record<string, AgentListEntry>;
};

const AgentListContext = createContext<AgentListState | null>(null);

const SyncResponseSchema = z.object({
  agentId: z.string(),
  profile: z.record(z.unknown()).nullable().optional(),
  metrics: z.record(z.unknown()).nullable().optional(),
});

function buildInitialState(agentIds: string[]): Record<string, AgentListEntry> {
  return agentIds.reduce<Record<string, AgentListEntry>>((acc, agentId) => {
    acc[agentId] = { synced: false };
    return acc;
  }, {});
}

export function AgentListProvider({ children }: { children: ReactNode }) {
  const agentIds = useMemo(() => getAllAgents().map((agent) => agent.id), []);
  const [agents, setAgents] = useState<Record<string, AgentListEntry>>(() =>
    buildInitialState(agentIds),
  );
  const startedRef = useRef(false);
  const inFlightRef = useRef<Set<string>>(new Set());

  const updateAgent = useCallback((agentId: string, update: Partial<AgentListEntry>) => {
    setAgents((prev) => ({
      ...prev,
      [agentId]: {
        ...(prev[agentId] ?? { synced: false }),
        ...update,
      },
    }));
  }, []);

  const syncAgent = useCallback(
    async (agentId: string) => {
      if (inFlightRef.current.has(agentId)) {
        return;
      }
      if (agents[agentId]?.synced) {
        return;
      }

      inFlightRef.current.add(agentId);
      const threadId = getAgentThreadId(agentId);

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

        updateAgent(agentId, {
          synced: true,
          profile: (payload.data.profile ?? undefined) as AgentViewProfile | undefined,
          metrics: (payload.data.metrics ?? undefined) as AgentViewMetrics | undefined,
          error: undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[agent-list] Sync failed', { agentId, error: message });
        updateAgent(agentId, { synced: true, error: message });
      } finally {
        inFlightRef.current.delete(agentId);
      }
    },
    [agents, updateAgent],
  );

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    agentIds.forEach((agentId) => {
      void syncAgent(agentId);
    });
  }, [agentIds, syncAgent]);

  const value = useMemo(() => ({ agents }), [agents]);

  return <AgentListContext.Provider value={value}>{children}</AgentListContext.Provider>;
}

export function useAgentList(): AgentListState {
  const context = useContext(AgentListContext);
  if (!context) {
    throw new Error('useAgentList must be used within an AgentListProvider');
  }
  return context;
}
