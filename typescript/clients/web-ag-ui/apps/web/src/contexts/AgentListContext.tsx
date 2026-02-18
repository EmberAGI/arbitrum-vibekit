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
import { ProxiedCopilotRuntimeAgent } from '@copilotkit/react-core/v2';

import { getAllAgents, isRegisteredAgentId } from '../config/agents';
import { usePrivyWalletClient } from '../hooks/usePrivyWalletClient';
import { getAgentThreadId } from '../utils/agentThread';
import {
  pollAgentIdsWithConcurrency,
  pollAgentListUpdateViaAgUi,
  resolveAgentListPollIntervalMs,
  resolveAgentListPollMaxConcurrent,
  selectAgentIdsForPolling,
} from './agentListPolling';
import type { AgentListEntry } from './agentListTypes';

type AgentListState = {
  agents: Record<string, AgentListEntry>;
  upsertAgent: (
    agentId: string,
    update: Partial<AgentListEntry>,
    source: AgentListUpdateSource,
  ) => void;
};

const AgentListContext = createContext<AgentListState | null>(null);

export type AgentListUpdateSource = 'detail-connect' | 'poll';

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

function shouldAcceptAgentListUpdate(params: {
  agentId: string;
  activeAgentId: string | null;
  source: AgentListUpdateSource;
}): boolean {
  if (params.source === 'detail-connect') {
    return params.activeAgentId === params.agentId;
  }
  return params.activeAgentId !== params.agentId;
}

export function AgentListProvider({ children }: { children: ReactNode }) {
  const agentIds = useMemo(() => getAllAgents().map((agent) => agent.id), []);
  const pathname = usePathname();
  const { privyWallet } = usePrivyWalletClient();
  const walletKey = privyWallet?.address?.trim().toLowerCase() ?? null;
  const activeAgentId = useMemo(() => resolveAgentIdFromPath(pathname), [pathname]);
  const [state, setState] = useState<{ walletKey: string | null; agents: Record<string, AgentListEntry> }>(
    () => ({
      walletKey,
      agents: buildInitialState(agentIds),
    }),
  );
  const startedRef = useRef(false);
  const lastWalletKeyRef = useRef(walletKey);
  const inFlightRef = useRef(new Set<string>());
  const periodicPollInFlightRef = useRef(false);

  const upsertAgent = useCallback((
    agentId: string,
    update: Partial<AgentListEntry>,
    source: AgentListUpdateSource,
  ) => {
    if (!shouldAcceptAgentListUpdate({ agentId, activeAgentId, source })) {
      return;
    }
    setState((prev) => {
      const baseAgents = prev.walletKey === walletKey ? prev.agents : buildInitialState(agentIds);
      return {
        walletKey,
        agents: {
          ...baseAgents,
          [agentId]: {
            ...(baseAgents[agentId] ?? { synced: false }),
            ...update,
          },
        },
      };
    });
  }, [activeAgentId, agentIds, walletKey]);

  const agents = state.walletKey === walletKey ? state.agents : buildInitialState(agentIds);
  const agentsRef = useRef(agents);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    if (lastWalletKeyRef.current === walletKey) {
      return;
    }

    lastWalletKeyRef.current = walletKey;
    startedRef.current = false;
    inFlightRef.current.clear();
  }, [walletKey]);

  const pollAgent = useCallback(
    async (agentId: string) => {
      if (!walletKey) {
        return;
      }
      if (inFlightRef.current.has(agentId)) {
        return;
      }

      const threadId = getAgentThreadId(agentId, walletKey);
      if (!threadId) {
        return;
      }

      inFlightRef.current.add(agentId);
      try {
        const update = await pollAgentListUpdateViaAgUi({
          agentId,
          threadId,
          timeoutMs: 2_500,
          createRuntimeAgent: ({ agentId: runtimeAgentId, threadId: runtimeThreadId }) =>
            new ProxiedCopilotRuntimeAgent({
              runtimeUrl: '/api/copilotkit',
              transport: 'single',
              agentId: runtimeAgentId,
              threadId: runtimeThreadId,
            }),
        });

        upsertAgent(agentId, update ?? { synced: true }, 'poll');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        upsertAgent(agentId, { synced: true, error: message }, 'poll');
      } finally {
        inFlightRef.current.delete(agentId);
      }
    },
    [upsertAgent, walletKey],
  );

  useEffect(() => {
    if (startedRef.current || !walletKey) {
      return;
    }

    startedRef.current = true;
    const initialCandidates = agentIds.filter((agentId) => !(activeAgentId && agentId === activeAgentId));
    const maxConcurrent = resolveAgentListPollMaxConcurrent(
      process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_MAX_CONCURRENT,
    );
    void pollAgentIdsWithConcurrency({
      agentIds: initialCandidates,
      maxConcurrent,
      pollAgent,
    });
  }, [activeAgentId, agentIds, pollAgent, walletKey]);

  useEffect(() => {
    if (!walletKey) {
      return undefined;
    }

    const intervalMs = resolveAgentListPollIntervalMs(process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_POLL_MS);
    const maxConcurrent = resolveAgentListPollMaxConcurrent(
      process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_MAX_CONCURRENT,
    );
    const timer = window.setInterval(() => {
      if (periodicPollInFlightRef.current) {
        return;
      }
      const candidates = selectAgentIdsForPolling({
        agentIds,
        agents: agentsRef.current,
        activeAgentId,
      });

      periodicPollInFlightRef.current = true;
      void pollAgentIdsWithConcurrency({
        agentIds: candidates,
        maxConcurrent,
        pollAgent,
      }).finally(() => {
        periodicPollInFlightRef.current = false;
      });
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
      periodicPollInFlightRef.current = false;
    };
  }, [activeAgentId, agentIds, pollAgent, walletKey]);

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
