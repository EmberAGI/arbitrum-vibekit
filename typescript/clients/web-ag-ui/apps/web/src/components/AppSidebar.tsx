'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useOnchainActionsIconMaps } from '@/hooks/useOnchainActionsIconMaps';
import { usePrivyWalletClient } from '@/hooks/usePrivyWalletClient';
import { useUpgradeToSmartAccount } from '@/hooks/useUpgradeToSmartAccount';
import { useAgent } from '@/contexts/AgentContext';
import {
  useAuthoritativeAgentSnapshotCache,
  useAuthoritativeAgentSnapshotCacheVersion,
} from '@/contexts/AuthoritativeAgentSnapshotCache';
import { useAgentList } from '@/contexts/AgentListContext';
import type { AgentConfig } from '@/config/agents';
import { getVisibleAgents } from '@/config/agents';
import type { AgentListEntry } from '@/contexts/agentListTypes';
import { PROTOCOL_TOKEN_FALLBACK } from '@/constants/protocolTokenFallback';
import { buildPortfolioProjection } from '@/projections/portfolio/buildPortfolioProjection';
import { portfolioProjectionInputSchema } from '@/projections/portfolio/schema';
import type {
  PortfolioProjectionInput,
  PortfolioProjectionPacket,
} from '@/projections/portfolio/types';
import type { TaskState } from '@/types/agent';
import { resolveSidebarTaskState } from '@/utils/resolveSidebarTaskState';
import { selectRuntimeTaskState } from '@/utils/selectRuntimeTaskState';
import { extractTaskStatusMessage } from '@/utils/extractTaskStatusMessage';
import { isPrivyConfigured } from '@/utils/privyConfig';
import { invokeAgentCommandRoute } from '@/utils/agentCommandRoute';
import { getAgentThreadId } from '@/utils/agentThread';
import { normalizeNameKey, normalizeSymbolKey, resolveAgentAvatarUri } from '@/utils/iconResolution';
import {
  SidebarActivityCard,
  SidebarAgentAvatar,
  type SidebarActivityCardControlSlice,
  type SidebarActivityCardTokenHolding,
  type SidebarActivityCardTokenSlice,
  type SidebarActivityCardView,
} from '@/components/ui/SidebarActivityCard';

export interface AgentActivity {
  id: string;
  name: string;
  subtitle?: string;
  status: 'active' | 'blocked' | 'completed';
  timestamp?: string;
  config: AgentConfig;
  entry?: AgentListEntry;
}

const PORTFOLIO_AGENT_ID = 'agent-portfolio-manager';
const HIRE_AGENTS_HREF = '/hire-agents';
const PORTFOLIO_AGENT_CHAT_HREF = `/hire-agents/${PORTFOLIO_AGENT_ID}?tab=chat`;
const NAV_ACCENT_PALETTE = ['#3566E8', '#7A5AF8', '#0EA5E9', '#D84E8F', '#4F46E5'] as const;
const UNALLOCATED_ACCENT_HEX = '#CDBFB3';

type SidebarProjectionCardData = {
  valueUsd: number;
  positiveAssetsUsd: number;
  liabilitiesUsd: number;
  allocationShare: number;
  tokenBreakdown: SidebarActivityCardTokenSlice[];
  tokenHoldings?: SidebarActivityCardTokenHolding[];
  controlBreakdown?: SidebarActivityCardControlSlice[];
  thirtyDayPnlPct?: number;
};

type FetchedPortfolioProjectionInput = {
  walletAddress: string;
  input: PortfolioProjectionInput;
};

type OptimisticActiveAgent = {
  agentId: string;
  sourcePathname: string | null;
};

export function getSidebarAgentHref(agentId: string): string {
  return agentId === PORTFOLIO_AGENT_ID ? PORTFOLIO_AGENT_CHAT_HREF : `/hire-agents/${agentId}`;
}

function getActiveSidebarAgentId(pathname: string | null): string | null {
  if (!pathname?.startsWith('/hire-agents/')) {
    return null;
  }

  const pathWithoutQuery = pathname.split('?')[0] ?? pathname;
  const routeAgentId = pathWithoutQuery.slice('/hire-agents/'.length).split('/')[0] ?? '';
  return routeAgentId.length > 0 ? routeAgentId : null;
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isActivityRailCollapsed, setIsActivityRailCollapsed] = useState(false);
  const [optimisticActiveAgent, setOptimisticActiveAgent] =
    useState<OptimisticActiveAgent | null>(null);
  const privyConfigured = isPrivyConfigured();

  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const {
    privyWallet,
    isLoading: isWalletLoading,
    error: walletError,
  } = usePrivyWalletClient();
  const {
    isDeployed: isSmartAccountDeployed,
    isLoading: isSmartAccountLoading,
    isUpgrading: isSmartAccountUpgrading,
    upgradeToSmartAccount,
    error: smartAccountError,
  } = useUpgradeToSmartAccount();

  // Get agent activity data from shared context
  const agent = useAgent();
  const authoritativeSnapshotCache = useAuthoritativeAgentSnapshotCache();
  const authoritativeSnapshotCacheVersion = useAuthoritativeAgentSnapshotCacheVersion();
  const { agents: listAgents } = useAgentList();

  const agentConfigs = useMemo(() => getVisibleAgents(), []);
  useEffect(() => {
    agentConfigs.forEach((config) => {
      router.prefetch?.(getSidebarAgentHref(config.id));
    });
  }, [agentConfigs, router]);

  const isInactiveRuntime = agent.config.id === 'inactive-agent';
  const runtimeAgentId = isInactiveRuntime ? null : agent.config.id;
  const runtimeTaskId = agent.uiState.task?.id;
  const runtimeLifecyclePhase = agent.uiState.lifecycle?.phase;
  const runtimeHaltReason = agent.uiState.haltReason;
  const runtimeExecutionError = agent.uiState.executionError;
  const runtimeIsHired = agent.uiState.selectors?.isHired;
  const portfolioManagerThreadId = getAgentThreadId(PORTFOLIO_AGENT_ID, privyWallet?.address);
  const portfolioManagerSnapshotCacheKey = portfolioManagerThreadId
    ? `${PORTFOLIO_AGENT_ID}:${portfolioManagerThreadId}`
    : null;
  const [fetchedPortfolioProjectionInput, setFetchedPortfolioProjectionInput] =
    useState<FetchedPortfolioProjectionInput | null>(null);
  const [portfolioProjectionRequestRetry, setPortfolioProjectionRequestRetry] = useState(0);
  const requestedPortfolioProjectionKeyRef = useRef<string | null>(null);
  const debugStatus = process.env.NEXT_PUBLIC_AGENT_STATUS_DEBUG === 'true';
  const runtimeTaskMessage = extractTaskStatusMessage(agent.uiState.task?.taskStatus?.message);
  const runtimeTaskState = selectRuntimeTaskState({
    effectiveTaskState: agent.uiState.selectors?.effectiveTaskState,
    lifecyclePhase: runtimeLifecyclePhase,
    taskState: agent.uiState.task?.taskStatus?.state,
    taskMessage: runtimeTaskMessage,
  }) as TaskState | undefined;

  const pinnedAgents: AgentActivity[] = [];

  agentConfigs.forEach((config) => {
    const listEntry = listAgents[config.id];
    const useRuntime = runtimeAgentId === config.id;
    const resolvedTaskState = useRuntime
      ? resolveSidebarTaskState({
          listTaskState: listEntry?.taskState,
          listLifecyclePhase: listEntry?.lifecyclePhase,
          listOnboardingStatus: listEntry?.onboardingStatus,
          runtimeTaskState,
          runtimeLifecyclePhase,
          runtimeOnboardingStatus: agent.uiState.onboardingFlow?.status,
          runtimeTaskMessage,
          fallbackToListWhenRuntimeMissing: false,
        })
      : listEntry?.taskState;
    const entry = useRuntime
      ? {
          ...listEntry,
          taskId: runtimeTaskId,
          taskState: resolvedTaskState,
          taskMessage: runtimeTaskMessage,
          haltReason: runtimeHaltReason,
          executionError: runtimeExecutionError,
          lifecyclePhase: (runtimeLifecyclePhase as AgentListEntry['lifecyclePhase']) ?? listEntry?.lifecyclePhase,
          onboardingStatus: agent.uiState.onboardingFlow?.status ?? listEntry?.onboardingStatus,
        }
      : listEntry;
    const isPinned =
      shouldPinSidebarAgent({
        entry,
        useRuntime,
        runtimeTaskId: useRuntime ? runtimeTaskId : undefined,
        runtimeLifecyclePhase: useRuntime ? runtimeLifecyclePhase : undefined,
        runtimeOnboardingStatus: useRuntime ? agent.uiState.onboardingFlow?.status : undefined,
        runtimeIsHired: useRuntime ? runtimeIsHired : undefined,
      });
    if (!isPinned) {
      return;
    }

    const status = resolvePinnedAgentStatus(entry?.taskState);

    if (debugStatus && runtimeAgentId === config.id) {
      console.debug('[AppSidebar] runtime classification', {
        agentId: config.id,
        source: useRuntime ? 'runtime' : 'list',
        runtimeTaskId,
        runtimeTaskState,
        runtimeTaskMessage,
        listTaskState: listEntry?.taskState,
        resolvedTaskState: entry?.taskState,
        isPinned,
        status,
      });
    }

    pinnedAgents.push({
      id: config.id,
      name: config.name,
      status,
      config,
      entry,
    });
  });

  const cachedPortfolioProjectionInput = useMemo(() => {
    void authoritativeSnapshotCacheVersion;
    const currentAgentProjectionInput =
      agent.config.id === PORTFOLIO_AGENT_ID
        ? readPortfolioProjectionInput(agent.domainProjection)
        : null;
    if (currentAgentProjectionInput) {
      return currentAgentProjectionInput;
    }

    if (!portfolioManagerSnapshotCacheKey) {
      return null;
    }

    const snapshot = authoritativeSnapshotCache.getSnapshot(portfolioManagerSnapshotCacheKey);
    return readPortfolioProjectionInput(snapshot?.thread?.domainProjection);
  }, [
    agent.config.id,
    agent.domainProjection,
    authoritativeSnapshotCache,
    authoritativeSnapshotCacheVersion,
    portfolioManagerSnapshotCacheKey,
  ]);

  useEffect(() => {
    if (cachedPortfolioProjectionInput || !portfolioManagerThreadId || !privyWallet?.address) {
      return;
    }

    const requestKey = `${PORTFOLIO_AGENT_ID}:${portfolioManagerThreadId}`;
    if (requestedPortfolioProjectionKeyRef.current === requestKey) {
      return;
    }
    requestedPortfolioProjectionKeyRef.current = requestKey;

    let canceled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRetry = () => {
      if (canceled) {
        return;
      }
      retryTimer = setTimeout(() => {
        requestedPortfolioProjectionKeyRef.current = null;
        setPortfolioProjectionRequestRetry((value) => value + 1);
      }, 5_000);
    };

    void (async () => {
      try {
        const response = await invokeAgentCommandRoute({
          agentId: PORTFOLIO_AGENT_ID,
          threadId: portfolioManagerThreadId,
          command: {
            name: 'refresh_portfolio_state',
          },
        });

        if (canceled) {
          return;
        }

        const projectionInput = readPortfolioProjectionInput(response.domainProjection ?? null);
        if (projectionInput) {
          setFetchedPortfolioProjectionInput({
            walletAddress: privyWallet.address,
            input: projectionInput,
          });
          return;
        }
        scheduleRetry();
      } catch {
        scheduleRetry();
      }
    })();

    return () => {
      canceled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [
    cachedPortfolioProjectionInput,
    portfolioManagerThreadId,
    portfolioProjectionRequestRetry,
    privyWallet?.address,
  ]);

  const allActivityAgents = pinnedAgents;
  const portfolioProjectionInput =
    cachedPortfolioProjectionInput ??
    (fetchedPortfolioProjectionInput &&
    fetchedPortfolioProjectionInput.walletAddress === privyWallet?.address
      ? fetchedPortfolioProjectionInput.input
      : null);
  const portfolioProjection = useMemo<PortfolioProjectionPacket | null>(() => {
    if (!portfolioProjectionInput) {
      return null;
    }

    return buildPortfolioProjection(portfolioProjectionInput);
  }, [portfolioProjectionInput]);
  const routeActiveSidebarAgentId = getActiveSidebarAgentId(pathname);
  const activeSidebarAgentId =
    optimisticActiveAgent?.sourcePathname === pathname
      ? optimisticActiveAgent.agentId
      : routeActiveSidebarAgentId;
  const totalKnownExposureUsd = allActivityAgents.reduce((total, activity) => {
    const nextValue = resolveGrossExposureUsd(activity.entry);
    return nextValue !== undefined ? total + nextValue : total;
  }, 0);
  const accentColorByAgentId = buildAccentColorByAgentId(
    allActivityAgents
      .filter((activity) => activity.id !== PORTFOLIO_AGENT_ID)
      .map((activity) => activity.id),
  );
  const specialistControlBreakdown = buildPortfolioControlBreakdown({
    activities: allActivityAgents,
    accentColorByAgentId,
  });
  const projectionCardDataByAgentId = buildSidebarProjectionCardDataByAgentId({
    portfolio: portfolioProjection,
    activities: allActivityAgents,
    accentColorByAgentId,
  });
  const baseActivityCardViewsById = useMemo(
    () =>
      Object.fromEntries(
        allActivityAgents.map((activity) => [
          activity.id,
          buildSidebarActivityCardView({
            activity,
            totalKnownExposureUsd,
            portfolioControlBreakdown: specialistControlBreakdown,
            projectionCardData: projectionCardDataByAgentId.get(activity.id),
          }),
        ]),
      ) as Record<string, SidebarActivityCardView>,
    [allActivityAgents, projectionCardDataByAgentId, specialistControlBreakdown, totalKnownExposureUsd],
  );
  const sidebarChainNames = useMemo(() => {
    const seen = new Set<string>();
    const chains: string[] = [];

    allActivityAgents.forEach((activity) => {
      const activityChains = activity.entry?.profile?.chains ?? activity.config.chains ?? [];
      activityChains.forEach((chain) => {
        const name = chain.trim();
        if (name.length === 0 || seen.has(name)) {
          return;
        }
        seen.add(name);
        chains.push(name);
      });
    });

    return chains;
  }, [allActivityAgents]);
  const sidebarTokenSymbols = useMemo(() => {
    const seen = new Set<string>();
    const tokens: string[] = [];
    const addToken = (symbol: string | undefined) => {
      const normalizedSymbol = symbol?.trim();
      if (!normalizedSymbol || seen.has(normalizedSymbol)) {
        return;
      }
      seen.add(normalizedSymbol);
      tokens.push(normalizedSymbol);
    };

    Object.values(baseActivityCardViewsById).forEach((card) => {
      card.tokenBreakdown.forEach((slice) => {
        addToken(slice.asset);
      });
      card.tokenHoldings?.forEach((holding) => {
        addToken(holding.asset);
      });
    });
    allActivityAgents.forEach((activity) => {
      const protocols = activity.entry?.profile?.protocols ?? activity.config.protocols ?? [];
      protocols.forEach((protocol) => {
        addToken(PROTOCOL_TOKEN_FALLBACK[protocol]);
      });
    });

    return tokens;
  }, [allActivityAgents, baseActivityCardViewsById]);
  const {
    chainIconByName: sidebarChainIconByName,
    tokenIconBySymbol: sidebarTokenIconBySymbol,
  } = useOnchainActionsIconMaps({
    chainNames: sidebarChainNames,
    tokenSymbols: sidebarTokenSymbols,
  });
  const sidebarAvatarByAgentId = useMemo(
    () =>
      Object.fromEntries(
        allActivityAgents.map((activity) => {
          const protocols = activity.entry?.profile?.protocols ?? activity.config.protocols ?? [];
          const chains = activity.entry?.profile?.chains ?? activity.config.chains ?? [];
          const avatarUri =
            resolveAgentAvatarUri({
              imageUrl: activity.config.imageUrl,
              protocols,
              tokenIconBySymbol: sidebarTokenIconBySymbol,
            }) ??
            (chains.length > 0 ? sidebarChainIconByName[normalizeNameKey(chains[0])] ?? null : null);

          return [
            activity.id,
            {
              avatarUri,
              avatarBackground:
                activity.config.imageUrl && activity.config.avatarBg
                  ? activity.config.avatarBg
                  : undefined,
              usesBrandedAvatar: Boolean(activity.config.imageUrl),
            },
          ];
        }),
      ) as Record<
        string,
        Pick<SidebarActivityCardView, 'avatarUri' | 'avatarBackground' | 'usesBrandedAvatar'>
      >,
    [allActivityAgents, sidebarChainIconByName, sidebarTokenIconBySymbol],
  );
  const activityCardViewsById = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(baseActivityCardViewsById).map(([agentId, card]) => [
          agentId,
          {
            ...card,
            ...sidebarAvatarByAgentId[agentId],
            tokenBreakdown: card.tokenBreakdown.map((slice) => ({
              ...slice,
              iconUri:
                slice.iconUri ??
                sidebarTokenIconBySymbol[normalizeSymbolKey(slice.asset)] ??
                null,
              fallbackIconSymbol: slice.fallbackIconSymbol ?? slice.asset,
            })),
            tokenHoldings: card.tokenHoldings?.map((holding) => ({
              ...holding,
              iconUri:
                holding.iconUri ??
                sidebarTokenIconBySymbol[normalizeSymbolKey(holding.asset)] ??
                null,
              fallbackIconSymbol: holding.fallbackIconSymbol ?? holding.asset,
            })),
          },
        ]),
      ) as Record<string, SidebarActivityCardView>,
    [baseActivityCardViewsById, sidebarAvatarByAgentId, sidebarTokenIconBySymbol],
  );
  const portfolioActivity = allActivityAgents.find((activity) => activity.id === PORTFOLIO_AGENT_ID) ?? null;
  const specialistActivities = allActivityAgents.filter((activity) => activity.id !== PORTFOLIO_AGENT_ID);

  // Navigate to agent detail page when clicking on an agent in the sidebar
  const handleAgentClick = (agentId: string) => {
    setOptimisticActiveAgent({
      agentId,
      sourcePathname: pathname,
    });
    router.push(getSidebarAgentHref(agentId));
  };

  const shouldShowSmartAccountUpgrade =
    privyConfigured &&
    authenticated &&
    Boolean(privyWallet) &&
    !walletError &&
    (isSmartAccountLoading || Boolean(smartAccountError) || isSmartAccountDeployed === false);
  const shouldShowWalletConnectionFooter =
    Boolean(walletError) || !privyConfigured || !authenticated || !privyWallet;
  const shouldShowFooter = shouldShowSmartAccountUpgrade || shouldShowWalletConnectionFooter;

  const sidebarWidthClassName = isActivityRailCollapsed ? 'w-[72px]' : 'w-[312px]';
  const sidebarPaddingClassName = isActivityRailCollapsed ? 'p-3' : 'p-4';

  return (
    <div
      className={`flex h-full flex-shrink-0 flex-col border-r border-[#DDC8B3] bg-[#F7EFE3] text-[#3C2A21] transition-[width] duration-200 ${sidebarWidthClassName}`}
    >
      <div className={`flex-1 overflow-y-auto ${sidebarPaddingClassName}`}>
        <div>
          <div
            className={`flex items-center ${
              isActivityRailCollapsed ? 'justify-center' : 'justify-end'
            }`}
          >
            <button
              type="button"
              aria-label={
                isActivityRailCollapsed
                  ? 'Expand agent activity rail'
                  : 'Collapse agent activity rail'
              }
              onClick={() => setIsActivityRailCollapsed((value) => !value)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#E7DBD0] bg-[#FCF8F3] text-[#8C7F72] transition hover:text-[#D97B3D]"
            >
              {isActivityRailCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {isActivityRailCollapsed ? (
            <CollapsedActivityRail
              portfolioActivity={portfolioActivity}
              specialistActivities={specialistActivities}
              cardViews={activityCardViewsById}
              activeAgentId={activeSidebarAgentId}
              onAgentClick={handleAgentClick}
              hireAgentsHref={HIRE_AGENTS_HREF}
            />
          ) : (
            <>
              {portfolioActivity ? (
                <div className="mt-4">
                  <SidebarActivityCard
                    card={
                      activityCardViewsById[portfolioActivity.id] ??
                      buildFallbackCardView(portfolioActivity)
                    }
                    active={activeSidebarAgentId === portfolioActivity.id}
                    onClick={() => handleAgentClick(portfolioActivity.id)}
                  />
                </div>
              ) : null}

              <SpecialistActivitySection
                agents={specialistActivities}
                cardViews={activityCardViewsById}
                activeAgentId={activeSidebarAgentId}
                onAgentClick={handleAgentClick}
                addAgentHref={HIRE_AGENTS_HREF}
              />
            </>
          )}
        </div>
      </div>

      {shouldShowFooter ? (
        <div className="p-4 border-t border-[#DDC8B3] space-y-3">
          {shouldShowSmartAccountUpgrade ? (
            <>
              {isSmartAccountLoading ? (
                <div className="w-full px-3 py-2 rounded-lg border border-[#DDC8B3] bg-[#FFF8F0] text-xs text-[#6F5A4C]">
                  Checking wallet status…
                </div>
              ) : smartAccountError ? (
                <div className="w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-200">
                  {smartAccountError.message}
                </div>
              ) : isSmartAccountDeployed === false ? (
                <div className="w-full p-3 rounded-lg bg-[#FFF8F0] border border-[#DDC8B3]">
                  <div className="text-xs text-[#6F5A4C]">
                    Upgrade your wallet to a smart account to enable delegations.
                  </div>
                  <button
                    type="button"
                    onClick={() => upgradeToSmartAccount()}
                    disabled={isSmartAccountUpgrading || isWalletLoading}
                    className="mt-2 w-full flex items-center justify-center px-3 py-2 rounded-lg bg-[#2F211B] hover:bg-[#241813] text-white text-sm font-medium transition-colors disabled:opacity-60 disabled:hover:bg-[#2F211B]"
                  >
                    {isSmartAccountUpgrading ? 'Upgrading…' : 'Upgrade wallet'}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {walletError ? (
            <div className="w-full px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-200">
              Wallet unavailable
            </div>
          ) : !privyConfigured ? (
            <div className="w-full px-3 py-2 rounded-lg border border-[#DDC8B3] bg-[#EFE4D7] text-xs text-[#8A6F58]">
              Privy auth unavailable
            </div>
          ) : !authenticated || !privyWallet ? (
            <button
              type="button"
              onClick={() => login()}
              disabled={!ready || (ready && authenticated)}
              className="w-full flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium transition-colors disabled:opacity-60 disabled:hover:bg-[#fd6731]"
            >
              {ready ? 'Login / Connect' : 'Loading...'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface SpecialistActivitySectionProps {
  agents: AgentActivity[];
  cardViews: Record<string, SidebarActivityCardView>;
  activeAgentId: string | null;
  onAgentClick?: (agentId: string) => void;
  addAgentHref: string;
}

function SpecialistActivitySection({
  agents,
  cardViews,
  activeAgentId,
  onAgentClick,
  addAgentHref,
}: SpecialistActivitySectionProps) {
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const syncScrollFades = () => {
    const viewport = listViewportRef.current;
    if (!viewport) {
      setShowTopFade(false);
      setShowBottomFade(false);
      return;
    }

    const scrollThreshold = 2;
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    setShowTopFade(viewport.scrollTop > scrollThreshold);
    setShowBottomFade(maxScrollTop - viewport.scrollTop > scrollThreshold);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      syncScrollFades();
    });

    const handleResize = () => {
      syncScrollFades();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
    };
  }, [agents]);

  return (
    <div className="group/specialists mt-4 border-t border-[#E4D5C7] pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8C7F72]">
          Specialists
        </div>
        {addAgentHref ? (
          <Link
            href={addAgentHref}
            aria-label="Hire agents"
            className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] border border-[#E7DBD0] bg-[#FCF8F3] font-mono text-[11px] leading-none text-[#8C7F72] opacity-0 transition group-hover/specialists:opacity-100 group-focus-within/specialists:opacity-100 hover:border-[#E8C9AA] hover:text-[#D97B3D]"
          >
            +
          </Link>
        ) : null}
      </div>

      <div className="mt-2.5">
        <div className="relative">
          {showTopFade ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-[#F7EFE3] via-[#F7EFE3]/95 to-transparent" />
          ) : null}
          <div
            ref={listViewportRef}
            onScroll={syncScrollFades}
            className="max-h-[26rem] space-y-1.5 overflow-y-auto pr-1"
          >
            {agents.map((agentItem) => (
              <SidebarActivityCard
                key={agentItem.id}
                card={cardViews[agentItem.id] ?? buildFallbackCardView(agentItem)}
                active={activeAgentId === agentItem.id}
                onClick={() => onAgentClick?.(agentItem.id)}
              />
            ))}
            <AddAgentCard href={addAgentHref} />
          </div>
          {showBottomFade ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-[#F7EFE3] via-[#F7EFE3]/95 to-transparent" />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CollapsedActivityRail(props: {
  portfolioActivity: AgentActivity | null;
  specialistActivities: AgentActivity[];
  cardViews: Record<string, SidebarActivityCardView>;
  activeAgentId: string | null;
  onAgentClick?: (agentId: string) => void;
  hireAgentsHref: string;
}) {
  const portfolioActivity = props.portfolioActivity;

  return (
    <div className="mt-4 flex flex-col items-center">
      {portfolioActivity ? (
        <button
          type="button"
          aria-label={portfolioActivity.name}
          onClick={() => props.onAgentClick?.(portfolioActivity.id)}
          className={`rounded-[12px] transition ${
            props.activeAgentId === portfolioActivity.id
              ? 'ring-1 ring-[#FF9C5A]'
              : 'hover:ring-1 hover:ring-[#E8C9AA]'
          }`}
        >
          <SidebarAgentAvatar
            agentId={portfolioActivity.id}
            avatarUri={props.cardViews[portfolioActivity.id]?.avatarUri}
            avatarBackground={props.cardViews[portfolioActivity.id]?.avatarBackground}
            usesBrandedAvatar={props.cardViews[portfolioActivity.id]?.usesBrandedAvatar}
            className="h-8 w-8 rounded-[10px]"
          />
        </button>
      ) : null}

      {portfolioActivity && props.specialistActivities.length > 0 ? (
        <div className="mt-3 h-px w-5 bg-[#E4D5C7]" />
      ) : null}

      {props.specialistActivities.length > 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2.5">
          {props.specialistActivities.map((activity) => (
            <button
              key={activity.id}
              type="button"
              aria-label={activity.name}
              onClick={() => props.onAgentClick?.(activity.id)}
              className={`rounded-[12px] transition ${
                props.activeAgentId === activity.id
                  ? 'ring-1 ring-[#FF9C5A]'
                  : 'hover:ring-1 hover:ring-[#E8C9AA]'
              }`}
            >
              <SidebarAgentAvatar
                agentId={activity.id}
                avatarUri={props.cardViews[activity.id]?.avatarUri}
                avatarBackground={props.cardViews[activity.id]?.avatarBackground}
                usesBrandedAvatar={props.cardViews[activity.id]?.usesBrandedAvatar}
                className="h-8 w-8 rounded-[10px]"
              />
            </button>
          ))}
        </div>
      ) : null}

      <Link
        href={props.hireAgentsHref}
        aria-label="Hire specialists"
        className="mt-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E7DBD0] bg-[#FCF8F3] font-mono text-[11px] leading-none text-[#8C7F72] transition hover:border-[#E8C9AA] hover:text-[#D97B3D]"
      >
        +
      </Link>
    </div>
  );
}

function AddAgentCard(props: { href: string }) {
  return (
    <Link
      href={props.href}
      aria-label="Add agent"
      className="flex w-full items-center gap-3 rounded-[18px] border border-dashed border-[#E1D4C7] bg-[#FBF7F2] px-3 py-3 text-left transition hover:border-[#E8C9AA] hover:bg-[#FFF7F2]"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#E7DBD0] bg-[#FCF8F3] font-mono text-[18px] leading-none text-[#8C7F72]">
        +
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-[#8C7F72]">
          Hire agent
        </span>
        <span className="mt-1 block text-[13px] font-semibold tracking-[-0.03em] text-[#6D5B4C]">
          Add specialist
        </span>
      </span>
    </Link>
  );
}

function buildFallbackCardView(activity: AgentActivity): SidebarActivityCardView {
  return {
    id: activity.id,
    label: activity.name,
    statusLabel: activity.subtitle,
    statusTone: activity.status,
    avatarUri: activity.config.imageUrl ?? null,
    avatarBackground:
      activity.config.imageUrl && activity.config.avatarBg ? activity.config.avatarBg : undefined,
    usesBrandedAvatar: Boolean(activity.config.imageUrl),
    tokenBreakdown: [],
  };
}

function buildSidebarActivityCardView(params: {
  activity: AgentActivity;
  totalKnownExposureUsd: number;
  portfolioControlBreakdown: SidebarActivityCardControlSlice[];
  projectionCardData?: SidebarProjectionCardData;
}): SidebarActivityCardView {
  const grossExposureUsd = params.projectionCardData?.valueUsd ?? resolveGrossExposureUsd(params.activity.entry);
  const allocationShare =
    params.projectionCardData?.allocationShare ??
    (grossExposureUsd !== undefined && params.totalKnownExposureUsd > 0
      ? grossExposureUsd / params.totalKnownExposureUsd
      : undefined);

  return {
    id: params.activity.id,
    label: params.activity.name,
    statusLabel: params.activity.subtitle,
    statusTone: params.activity.status,
    avatarUri: params.activity.config.imageUrl ?? null,
    avatarBackground:
      params.activity.config.imageUrl && params.activity.config.avatarBg
        ? params.activity.config.avatarBg
        : undefined,
    usesBrandedAvatar: Boolean(params.activity.config.imageUrl),
    valueUsd: grossExposureUsd,
    positiveAssetsUsd:
      params.projectionCardData?.positiveAssetsUsd ??
      (grossExposureUsd !== undefined ? grossExposureUsd : undefined),
    liabilitiesUsd: params.projectionCardData?.liabilitiesUsd ?? 0,
    allocationShare,
    metricBadge: resolveMetricBadge(params.activity.entry, params.activity.status),
    allocationShareLabel: params.projectionCardData ? 'portfolio' : 'tracked exposure',
    thirtyDayPnlPct: params.projectionCardData?.thirtyDayPnlPct,
    tokenBreakdown:
      params.projectionCardData?.tokenBreakdown ??
      buildTokenBreakdown({
        entry: params.activity.entry,
        config: params.activity.config,
      }),
    tokenHoldings: params.projectionCardData?.tokenHoldings,
    controlBreakdown:
      params.projectionCardData?.controlBreakdown ??
      (params.activity.id === PORTFOLIO_AGENT_ID && params.portfolioControlBreakdown.length > 0
        ? params.portfolioControlBreakdown
        : undefined),
  };
}

function resolveGrossExposureUsd(entry: AgentListEntry | undefined): number | undefined {
  const candidate = entry?.metrics?.aumUsd ?? entry?.profile?.aum;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : undefined;
}

function resolveMetricBadge(
  entry: AgentListEntry | undefined,
  _status: AgentActivity['status'],
): string | undefined {
  const apy = entry?.metrics?.apy ?? entry?.profile?.apy;
  if (typeof apy === 'number' && Number.isFinite(apy)) {
    return `${formatMetricNumber(apy)}% APY`;
  }
  return undefined;
}

function hasPinnedSidebarEvidence(entry: AgentListEntry | undefined): boolean {
  if (!entry?.synced) {
    return false;
  }

  return Boolean(
    entry.taskId ||
      entry.taskState ||
      entry.profile ||
      entry.metrics ||
      entry.lifecyclePhase === 'active' ||
      entry.onboardingStatus === 'completed' ||
      entry.onboardingStatus === 'failed' ||
      entry.onboardingStatus === 'canceled',
  );
}

function shouldPinSidebarAgent(params: {
  entry: AgentListEntry | undefined;
  useRuntime: boolean;
  runtimeTaskId?: string | null;
  runtimeLifecyclePhase?: string | null;
  runtimeOnboardingStatus?: AgentListEntry['onboardingStatus'];
  runtimeIsHired?: boolean;
}): boolean {
  if (params.entry?.isHired) {
    return true;
  }

  if (hasPinnedSidebarEvidence(params.entry)) {
    return true;
  }

  if (!params.useRuntime) {
    return false;
  }

  return Boolean(
    params.runtimeIsHired ||
    params.runtimeTaskId ||
      params.runtimeLifecyclePhase === 'active' ||
      params.runtimeOnboardingStatus === 'completed' ||
      params.runtimeOnboardingStatus === 'failed' ||
      params.runtimeOnboardingStatus === 'canceled',
  );
}

function resolvePinnedAgentStatus(
  taskState: AgentListEntry['taskState'] | undefined,
): AgentActivity['status'] {
  if (taskState === 'input-required' || taskState === 'failed') {
    return 'blocked';
  }

  if (taskState === 'completed' || taskState === 'canceled') {
    return 'completed';
  }

  return 'active';
}

function buildTokenBreakdown(params: {
  entry: AgentListEntry | undefined;
  config: AgentConfig;
}): SidebarActivityCardTokenSlice[] {
  const snapshotTokens = params.entry?.metrics?.latestSnapshot?.positionTokens
    ?.filter(
      (token): token is typeof token & { symbol: string; valueUsd: number } =>
        typeof token.symbol === 'string' &&
        token.symbol.trim().length > 0 &&
        typeof token.valueUsd === 'number' &&
        Number.isFinite(token.valueUsd) &&
        token.valueUsd > 0,
    )
    .sort((left, right) => (right.valueUsd ?? 0) - (left.valueUsd ?? 0));

  if (snapshotTokens && snapshotTokens.length > 0) {
    const total = snapshotTokens.reduce((sum, token) => sum + (token.valueUsd ?? 0), 0);
    return snapshotTokens.map((token) => ({
      asset: token.symbol,
      share: total > 0 ? (token.valueUsd ?? 0) / total : 0,
    }));
  }

  const tokens =
    params.entry?.profile?.tokens && params.entry.profile.tokens.length > 0
      ? params.entry.profile.tokens
      : (params.config.tokens ?? []);
  const uniqueTokens = [...new Set(tokens.filter((token) => token.trim().length > 0))].slice(0, 4);
  if (uniqueTokens.length === 0) {
    return [];
  }

  return uniqueTokens.map((token) => ({
    asset: token,
    share: 1 / uniqueTokens.length,
  }));
}

function buildPortfolioControlBreakdown(params: {
  activities: AgentActivity[];
  accentColorByAgentId: Map<string, string>;
}): SidebarActivityCardControlSlice[] {
  const portfolioGrossExposureUsd = params.activities.find((activity) => activity.id === PORTFOLIO_AGENT_ID)
    ? resolveGrossExposureUsd(params.activities.find((activity) => activity.id === PORTFOLIO_AGENT_ID)?.entry)
    : undefined;
  if (!portfolioGrossExposureUsd || portfolioGrossExposureUsd <= 0) {
    return [];
  }

  const specialists = params.activities
    .filter((activity) => activity.id !== PORTFOLIO_AGENT_ID)
    .map((activity) => ({
      id: activity.id,
      label: activity.name,
      valueUsd: resolveGrossExposureUsd(activity.entry) ?? 0,
    }))
    .filter((activity) => activity.valueUsd > 0)
    .sort((left, right) => right.valueUsd - left.valueUsd);

  if (specialists.length === 0) {
    return [];
  }

  const specialistTotalUsd = specialists.reduce((sum, activity) => sum + activity.valueUsd, 0);
  const slices = specialists.map((activity) => ({
    id: activity.id,
    label: activity.label,
    share: Math.min(1, activity.valueUsd / portfolioGrossExposureUsd),
    colorHex: params.accentColorByAgentId.get(activity.id) ?? NAV_ACCENT_PALETTE[0],
  }));
  const unallocatedUsd = Math.max(0, portfolioGrossExposureUsd - specialistTotalUsd);
  if (unallocatedUsd > 0) {
    slices.push({
      id: 'unallocated',
      label: 'Unmanaged',
      share: unallocatedUsd / portfolioGrossExposureUsd,
      colorHex: UNALLOCATED_ACCENT_HEX,
    });
  }

  return slices;
}

function buildAccentColorByAgentId(agentIds: string[]): Map<string, string> {
  const colorsByAgentId = new Map<string, string>();
  const usedIndexes = new Set<number>();

  for (const agentId of [...agentIds].sort()) {
    const baseIndex = hashAgentId(agentId) % NAV_ACCENT_PALETTE.length;
    let paletteIndex = baseIndex;
    let attempts = 0;

    while (usedIndexes.has(paletteIndex) && attempts < NAV_ACCENT_PALETTE.length) {
      paletteIndex = (paletteIndex + 1) % NAV_ACCENT_PALETTE.length;
      attempts += 1;
    }

    usedIndexes.add(paletteIndex);
    colorsByAgentId.set(agentId, NAV_ACCENT_PALETTE[paletteIndex] ?? NAV_ACCENT_PALETTE[0]);
  }

  return colorsByAgentId;
}

function hashAgentId(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPortfolioProjectionInput(
  domainProjection: Record<string, unknown> | null | undefined,
): PortfolioProjectionInput | null {
  if (!isRecord(domainProjection)) {
    return null;
  }

  const parsed = portfolioProjectionInputSchema.safeParse(domainProjection['portfolioProjectionInput']);
  return parsed.success ? parsed.data : null;
}

function buildSidebarProjectionCardDataByAgentId(params: {
  portfolio: PortfolioProjectionPacket | null;
  activities: AgentActivity[];
  accentColorByAgentId: Map<string, string>;
}): Map<string, SidebarProjectionCardData> {
  if (!params.portfolio) {
    return new Map();
  }

  const portfolio = params.portfolio;
  const activityNameByAgentId = new Map(
    params.activities.map((activity) => [activity.id, activity.name] as const),
  );
  const routeAgentIdByProjectionAgentId = new Map<string, string>();

  params.activities.forEach((activity) => {
    routeAgentIdByProjectionAgentId.set(activity.id, activity.id);
    if (activity.id.startsWith('agent-')) {
      routeAgentIdByProjectionAgentId.set(activity.id.slice('agent-'.length), activity.id);
    }
  });
  const portfolioGrossExposureUsd = portfolio.agents.portfolio.grossExposureUsd;
  const specialistControlledUsd = portfolio.agents.specialists.reduce(
    (sum, allocation) => sum + allocation.grossExposureUsd,
    0,
  );
  const specialistSlices = portfolio.agents.specialists.map((allocation) => {
    const routeAgentId =
      routeAgentIdByProjectionAgentId.get(allocation.agentId) ?? allocation.agentId;

    return {
      id: routeAgentId,
      label: activityNameByAgentId.get(routeAgentId) ?? formatAgentIdLabel(allocation.agentId),
      share: portfolioGrossExposureUsd > 0 ? allocation.grossExposureUsd / portfolioGrossExposureUsd : 0,
      colorHex: params.accentColorByAgentId.get(routeAgentId) ?? NAV_ACCENT_PALETTE[0],
    };
  });
  const unallocatedUsd = Math.max(0, portfolioGrossExposureUsd - specialistControlledUsd);
  const dataByAgentId = new Map<string, SidebarProjectionCardData>();

  dataByAgentId.set(PORTFOLIO_AGENT_ID, {
    valueUsd: portfolioGrossExposureUsd,
    positiveAssetsUsd: portfolio.agents.portfolio.positiveAssetsUsd,
    liabilitiesUsd: portfolio.agents.portfolio.liabilitiesUsd,
    allocationShare: 1,
    tokenBreakdown: buildProjectionTokenBreakdown(portfolio.agents.portfolio.tokenExposures),
    tokenHoldings: buildProjectionTokenHoldings({
      assetFamilies: portfolio.assetFamilies,
      totalPortfolioUsd: portfolio.summary.positiveAssetsUsd,
    }),
    controlBreakdown: [
      ...specialistSlices,
      {
        id: 'unallocated',
        label: 'Unmanaged',
        share: portfolioGrossExposureUsd > 0 ? unallocatedUsd / portfolioGrossExposureUsd : 0,
        colorHex: UNALLOCATED_ACCENT_HEX,
      },
    ],
    thirtyDayPnlPct: portfolio.previewExtensions?.topbarPerformance?.monthChangePct,
  });

  portfolio.agents.specialists.forEach((allocation) => {
    const routeAgentId =
      routeAgentIdByProjectionAgentId.get(allocation.agentId) ?? allocation.agentId;

    dataByAgentId.set(routeAgentId, {
      valueUsd: allocation.grossExposureUsd,
      positiveAssetsUsd: allocation.positiveAssetsUsd,
      liabilitiesUsd: allocation.liabilitiesUsd,
      allocationShare: allocation.allocationShare,
      tokenBreakdown: buildProjectionTokenBreakdown(allocation.tokenExposures),
      thirtyDayPnlPct:
        portfolio.previewExtensions?.agentPerformanceById?.[routeAgentId]?.thirtyDayPnlPct ??
        portfolio.previewExtensions?.agentPerformanceById?.[allocation.agentId]?.thirtyDayPnlPct,
    });
  });

  return dataByAgentId;
}

function buildProjectionTokenBreakdown(
  tokenExposures: PortfolioProjectionPacket['agents']['portfolio']['tokenExposures'],
): SidebarActivityCardTokenSlice[] {
  return tokenExposures.map((tokenExposure) => ({
    asset: tokenExposure.asset,
    share: tokenExposure.share,
  }));
}

function buildProjectionTokenHoldings(params: {
  assetFamilies: PortfolioProjectionPacket['assetFamilies'];
  totalPortfolioUsd: number;
}): SidebarActivityCardTokenHolding[] {
  return params.assetFamilies
    .filter((family) => family.positiveUsd > 0)
    .map((family) => ({
      asset: family.asset,
      amount: family.observedAssets
        .filter((observedAsset) => observedAsset.sourceKind !== 'debt')
        .reduce((sum, observedAsset) => sum + resolveObservedAssetDisplayQuantity(observedAsset), 0),
      share: params.totalPortfolioUsd > 0 ? family.positiveUsd / params.totalPortfolioUsd : 0,
      valueUsd: family.positiveUsd,
    }))
    .filter((holding) => holding.amount > 0 && holding.valueUsd > 0)
    .sort((left, right) => right.valueUsd - left.valueUsd)
    .slice(0, 5);
}

function resolveObservedAssetDisplayQuantity(
  observedAsset: PortfolioProjectionPacket['assetFamilies'][number]['observedAssets'][number],
): number {
  const displayQuantity =
    observedAsset.displayQuantity === undefined ? null : Number(observedAsset.displayQuantity);
  if (displayQuantity !== null && Number.isFinite(displayQuantity) && displayQuantity > 0) {
    return displayQuantity;
  }

  return observedAsset.quantity;
}

function formatAgentIdLabel(agentId: string): string {
  return agentId
    .replace(/^agent-/, '')
    .split(/[\s._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMetricNumber(value: number): string {
  return value
    .toFixed(1)
    .replace(/\.0$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
}
