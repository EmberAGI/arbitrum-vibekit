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
import { getAgentThreadId, resolveAgentThreadWalletAddress } from '../utils/agentThread';
import {
  pollAgentIdsWithConcurrency,
  pollAgentListUpdateViaAgUi,
  resolveAgentListPollBusyCooldownMs,
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
  const walletKey = resolveAgentThreadWalletAddress(privyWallet?.address);
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
  const pollBusyUntilByAgentRef = useRef(new Map<string, number>());
  const pollBusyCooldownMs = resolveAgentListPollBusyCooldownMs(
    process.env.NEXT_PUBLIC_AGENT_LIST_BUSY_COOLDOWN_MS,
  );
  const debugStatus = process.env.NEXT_PUBLIC_AGENT_STATUS_DEBUG === 'true';

  const pruneBusyCooldowns = useCallback((nowMs: number) => {
    for (const [agentId, busyUntil] of pollBusyUntilByAgentRef.current.entries()) {
      if (busyUntil <= nowMs) {
        pollBusyUntilByAgentRef.current.delete(agentId);
      }
    }
  }, []);

  const busyCooldownSnapshot = useCallback((): Record<string, number> => {
    const snapshot: Record<string, number> = {};
    for (const [agentId, busyUntil] of pollBusyUntilByAgentRef.current.entries()) {
      snapshot[agentId] = busyUntil;
    }
    return snapshot;
  }, []);

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
    pollBusyUntilByAgentRef.current.clear();
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
        const outcome = await pollAgentListUpdateViaAgUi({
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

        const nowMs = Date.now();
        if (outcome.busy) {
          pollBusyUntilByAgentRef.current.set(agentId, nowMs + pollBusyCooldownMs);
          console.warn('[AgentListContext.poll] Busy run detected; applying poll cooldown', {
            source: 'agent-list-poll',
            agentId,
            threadId,
            cooldownMs: pollBusyCooldownMs,
            busyUntilIso: new Date(nowMs + pollBusyCooldownMs).toISOString(),
          });
        } else {
          pollBusyUntilByAgentRef.current.delete(agentId);
        }

        if (debugStatus) {
          console.debug('[AgentListContext.poll] update', {
            source: 'agent-list-poll',
            agentId,
            threadId,
            busy: outcome.busy,
            update: outcome.update,
          });
        }

        upsertAgent(agentId, outcome.update ?? { synced: true }, 'poll');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[AgentListContext.poll] Poll failed', {
          source: 'agent-list-poll',
          agentId,
          threadId,
          detail: message,
        });
        upsertAgent(agentId, { synced: true, error: message }, 'poll');
      } finally {
        inFlightRef.current.delete(agentId);
      }
    },
    [debugStatus, pollBusyCooldownMs, upsertAgent, walletKey],
  );

  useEffect(() => {
    if (startedRef.current || !walletKey) {
      return;
    }

    startedRef.current = true;
    const nowMs = Date.now();
    pruneBusyCooldowns(nowMs);
    const initialCandidates = agentIds.filter((agentId) => !(activeAgentId && agentId === activeAgentId));
    const eligibleCandidates = selectAgentIdsForPolling({
      agentIds: initialCandidates,
      agents: agentsRef.current,
      activeAgentId,
      busyUntilByAgent: busyCooldownSnapshot(),
      nowMs,
    });
    const maxConcurrent = resolveAgentListPollMaxConcurrent(
      process.env.NEXT_PUBLIC_AGENT_LIST_SYNC_MAX_CONCURRENT,
    );
    void pollAgentIdsWithConcurrency({
      agentIds: eligibleCandidates,
      maxConcurrent,
      pollAgent,
    });
  }, [activeAgentId, agentIds, busyCooldownSnapshot, pollAgent, pruneBusyCooldowns, walletKey]);

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
      const nowMs = Date.now();
      pruneBusyCooldowns(nowMs);
      const candidates = selectAgentIdsForPolling({
        agentIds,
        agents: agentsRef.current,
        activeAgentId,
        busyUntilByAgent: busyCooldownSnapshot(),
        nowMs,
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
  }, [activeAgentId, agentIds, busyCooldownSnapshot, pollAgent, pruneBusyCooldowns, walletKey]);

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
