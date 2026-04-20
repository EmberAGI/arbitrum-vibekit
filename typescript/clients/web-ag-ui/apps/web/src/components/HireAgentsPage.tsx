'use client';

/* eslint-disable @next/next/no-img-element */

import { SlidersHorizontal, Star, MoreHorizontal, ChevronDown, Flame } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { SearchBar } from './ui/SearchBar';
import { FilterTabs } from './ui/FilterTabs';
import { Pagination } from './ui/Pagination';
import { AgentsTable } from './agents/AgentsTable';
import { Skeleton } from './ui/Skeleton';
import { CreatorIdentity } from './ui/CreatorIdentity';
import { CursorListTooltip } from './ui/CursorListTooltip';
import { AgentSurfaceTag } from './ui/AgentSurfaceTag';
import { CTA_SIZE_MD } from './ui/cta';
import { PROTOCOL_TOKEN_FALLBACK } from '../constants/protocolTokenFallback';
import { useOnchainActionsIconMaps } from '../hooks/useOnchainActionsIconMaps';
import { collectUniqueChainNames, collectUniqueTokenSymbols } from '../utils/agentCollections';
import {
  resolveAgentAvatarUri,
  resolveChainIconUris,
  resolveProtocolIconUris,
  resolveTokenIconUris,
  resolveTokenIconUri,
  iconMonogram,
  normalizeNameKey,
  normalizeSymbolKey,
  proxyIconUri,
} from '../utils/iconResolution';
import { getVisibleSurfaceProtocols } from '../utils/agentSurfaceMetadata';

export interface Agent {
  id: string;
  rank?: number;
  name: string;
  creator: string;
  creatorVerified?: boolean;
  rating?: number;
  ratingCount?: number;
  weeklyIncome?: number;
  apy?: number;
  users?: number;
  aum?: number;
  points?: number;
  pointsTrend?: 'up' | 'down' | 'neutral';
  trendMultiplier?: string;
  avatar?: string;
  avatarBg?: string;
  imageUrl?: string;
  surfaceTag?: 'Swarm' | 'Workflow';
  marketplaceCardBg?: string;
  marketplaceCardHoverBg?: string;
  marketplaceRowBg?: string;
  marketplaceRowHoverBg?: string;
  chains?: string[];
  protocols?: string[];
  tokens?: string[];
  status: 'for_hire' | 'hired' | 'unavailable';
  isActive?: boolean;
  isFeatured?: boolean;
  featuredRank?: number;
  isLoaded: boolean;
}

export interface FeaturedAgent {
  id: string;
  rank?: number;
  name: string;
  description?: string;
  creator?: string;
  creatorVerified?: boolean;
  rating?: number;
  users?: number;
  aum?: number;
  apy?: number;
  weeklyIncome?: number;
  chains?: string[];
  protocols?: string[];
  tokens?: string[];
  avatar?: string;
  avatarBg?: string;
  imageUrl?: string;
  surfaceTag?: 'Swarm' | 'Workflow';
  marketplaceCardBg?: string;
  marketplaceCardHoverBg?: string;
  marketplaceRowBg?: string;
  marketplaceRowHoverBg?: string;
  pointsTrend?: 'up' | 'down';
  trendMultiplier?: string;
  status: 'for_hire' | 'hired' | 'unavailable';
  isLoaded: boolean;
}

interface HireAgentsPageProps {
  agents: Agent[];
  featuredAgents: FeaturedAgent[];
  onHireAgent?: (agentId: string) => void;
  onViewAgent?: (agentId: string) => void;
  initialCollapsedFeaturedCardIds?: string[];
}

export function HireAgentsPage({
  agents,
  featuredAgents,
  onHireAgent,
  onViewAgent,
  initialCollapsedFeaturedCardIds,
}: HireAgentsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'income' | 'apy' | 'users' | 'aum'>('income');
  const [filterStatus, setFilterStatus] = useState<'all' | 'hired' | 'for_hire'>('for_hire');
  const [currentPage, setCurrentPage] = useState(1);
  const [collapsedFeaturedCardById, setCollapsedFeaturedCardById] = useState<Record<string, true>>(() => {
    const out: Record<string, true> = {};
    for (const id of initialCollapsedFeaturedCardIds ?? []) {
      if (id.trim().length > 0) {
        out[id] = true;
      }
    }
    return out;
  });

  const hiredCount = agents.filter((a) => a.status === 'hired').length;
  const forHireCount = agents.filter((a) => a.status === 'for_hire').length;

  // Filter featured agents: prioritize non-hired agents since hired appear in sidebar
  const displayFeaturedAgents = useMemo(() => {
    const nonHired = featuredAgents.filter((a) => a.status !== 'hired');
    const hired = featuredAgents.filter((a) => a.status === 'hired');
    return [...nonHired, ...hired].slice(0, 4);
  }, [featuredAgents]);

  const filteredAgents = agents
    .filter((agent) => {
      const matchesSearch =
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.creator.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter =
        filterStatus === 'all' ||
        (filterStatus === 'hired' && agent.status === 'hired') ||
        (filterStatus === 'for_hire' && agent.status === 'for_hire');
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const aFeaturedRank = a.featuredRank ?? Number.POSITIVE_INFINITY;
      const bFeaturedRank = b.featuredRank ?? Number.POSITIVE_INFINITY;
      const aIsFeatured = a.featuredRank !== undefined;
      const bIsFeatured = b.featuredRank !== undefined;

      if (aIsFeatured && !bIsFeatured) {
        return -1;
      }
      if (bIsFeatured && !aIsFeatured) {
        return 1;
      }
      if (aFeaturedRank !== bFeaturedRank) {
        return aFeaturedRank - bFeaturedRank;
      }
      switch (sortBy) {
        case 'income':
          return (b.weeklyIncome ?? 0) - (a.weeklyIncome ?? 0);
        case 'apy':
          return (b.apy ?? 0) - (a.apy ?? 0);
        case 'users':
          return (b.users ?? 0) - (a.users ?? 0);
        case 'aum':
          return (b.aum ?? 0) - (a.aum ?? 0);
        default:
          return 0;
      }
    });

  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / itemsPerPage));
  const shouldShowPagination = filteredAgents.length > itemsPerPage;
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedAgents = filteredAgents.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage,
  );

  const iconDataSources = useMemo(() => [...agents, ...featuredAgents], [agents, featuredAgents]);

  const desiredChainNames = useMemo(
    () => collectUniqueChainNames({ groups: iconDataSources }),
    [iconDataSources],
  );

  const desiredTokenSymbols = useMemo(
    () =>
      collectUniqueTokenSymbols({
        groups: iconDataSources,
        protocolTokenFallback: PROTOCOL_TOKEN_FALLBACK,
      }),
    [iconDataSources],
  );

  const { chainIconByName, tokenIconBySymbol, isLoaded: iconsLoaded } = useOnchainActionsIconMaps({
    chainNames: desiredChainNames,
    tokenSymbols: desiredTokenSymbols,
  });

  return (
    <div
      className={[
        'hire-agents-page flex-1 overflow-y-auto p-8',
        '[--hire-accent:#FD6731]',
        '[--hire-accent-hover:#E55A28]',
        '[--hire-accent-soft:rgba(253,103,49,0.16)]',
        '[--hire-accent-soft-strong:rgba(253,103,49,0.26)]',
      ].join(' ')}
    >
      <div className="max-w-[1400px] mx-auto">
        <div className="rounded-3xl border border-[#E2D0BE] bg-gradient-to-b from-[#FFF9F2] to-[#F2E8DB] shadow-[0_24px_80px_rgba(103,61,34,0.12)] p-8">
          {/* Page Header */}
          <h1 className="text-[28px] leading-[1.1] font-semibold text-[#241813] tracking-tight mb-5">
            Hire Agents
          </h1>

          {/* Banner CTA */}
          <div className="relative mb-8 rounded-2xl overflow-hidden border border-[#E7D3BE] bg-gradient-to-r from-[#FFF4E8] via-[#FBEBDD] to-[#F6E4D4]">
            <div className="absolute inset-0">
              <div className="absolute inset-0 opacity-90 bg-[radial-gradient(circle_at_15%_35%,rgba(253,103,49,0.18),transparent_55%)]" />
              <div className="absolute inset-0 opacity-75 bg-[radial-gradient(circle_at_48%_12%,rgba(227,160,78,0.20),transparent_60%)]" />
              <div className="absolute inset-0 opacity-55 bg-[radial-gradient(circle_at_78%_62%,rgba(255,255,255,0.55),transparent_58%)]" />
            </div>
            <div className="relative flex items-stretch justify-between gap-6 pr-5">
              <div className="flex items-stretch min-w-0">
                <div className="w-[308px] self-stretch shrink-0">
                  <img
                    src="/hire-publish-agent.png"
                    alt="Publish agent illustration"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 py-5 pl-5">
                  <h2 className="text-lg font-semibold text-[#241813] mb-1">
                    Publish your agent for hire
                  </h2>
                  <p className="text-[#7B6758] text-[13px] leading-5">
                    Your agent earns for it&apos;s services. And so do you.
                  </p>
                </div>
              </div>
              <div className="shrink-0 py-5 flex items-center">
                <button
                  className={[
                    'shrink-0',
                    CTA_SIZE_MD,
                    'bg-[color:var(--hire-accent)] hover:bg-[color:var(--hire-accent-hover)] text-white transition-colors',
                  ].join(' ')}
                >
                  Publish
                </button>
              </div>
            </div>
          </div>

          {/* Featured Agents Carousel */}
          {displayFeaturedAgents.length > 0 && (
            <div className="mb-7">
              <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
                {displayFeaturedAgents.map((agent, index) => {
                  const chainIconUris = resolveChainIconUris({
                    chainNames: agent.chains ?? [],
                    chainIconByName,
                  });
                  const chainItems = (agent.chains ?? []).map((label) => ({
                    label,
                    iconUri: chainIconByName[normalizeNameKey(label)] ?? null,
                  }));
                  const protocolItems = getVisibleSurfaceProtocols(agent.protocols ?? []).map((label) => {
                    const fallback = PROTOCOL_TOKEN_FALLBACK[label];
                    const iconUri = fallback
                      ? tokenIconBySymbol[normalizeSymbolKey(fallback)] ?? null
                      : null;
                    return { label, iconUri };
                  });
                  const tokenItems = (agent.tokens ?? []).map((label) => ({
                    label,
                    iconUri: resolveTokenIconUri({ symbol: label, tokenIconBySymbol }),
                  }));
                  const avatarUri =
                    resolveAgentAvatarUri({
                      imageUrl: agent.imageUrl,
                      protocols: agent.protocols ?? [],
                      tokenIconBySymbol,
                    }) ??
                    chainIconUris[0] ??
                    null;

                  return (
                    <FeaturedAgentCard
                      key={agent.id}
                      agent={agent}
                      index={index}
                      chainItems={chainItems}
                      protocolItems={protocolItems}
                      tokenItems={tokenItems}
                      avatarUri={avatarUri}
                      isMetricsCollapsed={Boolean(collapsedFeaturedCardById[agent.id])}
                      onToggleMetrics={() => {
                        setCollapsedFeaturedCardById((previous) => {
                          const next = { ...previous };
                          if (next[agent.id]) {
                            delete next[agent.id];
                          } else {
                            next[agent.id] = true;
                          }
                          return next;
                        });
                      }}
                      onClick={() => onViewAgent?.(agent.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex items-center gap-4 mb-5">
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search" />

            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="appearance-none h-10 flex items-center gap-2 px-4 pr-9 rounded-full bg-[#FFF8F0] border border-[#DDC8B3] hover:bg-[#F4E6D8] transition-colors text-[13px] text-[#241813] cursor-pointer focus:outline-none focus:border-[color:var(--hire-accent)] focus:ring-2 focus:ring-[color:var(--hire-accent-soft)]"
                >
                  <option value="income">Sort by: Income</option>
                  <option value="apy">Sort by: APY</option>
                  <option value="users">Sort by: Users</option>
                  <option value="aum">Sort by: AUM</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B7C63] pointer-events-none" />
              </div>

              <button className="h-10 flex items-center gap-2 px-4 rounded-full bg-[#FFF8F0] border border-[#DDC8B3] hover:bg-[#F4E6D8] transition-colors text-[#241813]">
                <SlidersHorizontal className="w-4 h-4" />
                <span className="text-[13px]">Filter</span>
              </button>
            </div>

            {/* Filter Tabs */}
            <FilterTabs
              tabs={[
                { id: 'all', label: 'All' },
                {
                  id: 'hired',
                  label: 'Hired',
                  count: hiredCount,
                  activeClassName: 'bg-[#E6F1E8] text-[#4E7A58] border border-[#C8DFC9]',
                  countClassName: 'bg-[#D9EAD9] text-[#4E7A58]',
                },
                {
                  id: 'for_hire',
                  label: 'For Hire',
                  count: forHireCount,
                  activeClassName:
                    'bg-[color:var(--hire-accent-soft)] text-[color:var(--hire-accent)] border border-[color:var(--hire-accent-soft-strong)]',
                  countClassName: 'bg-[color:var(--hire-accent-soft)] text-[color:var(--hire-accent)]',
                },
              ]}
              activeTab={filterStatus}
              onTabChange={(tab) => setFilterStatus(tab as typeof filterStatus)}
            />
          </div>

          {/* Agents Table */}
          <AgentsTable
            agents={paginatedAgents.map((agent, index) => ({
              id: agent.id,
              rank: agent.rank ?? index + 1,
              name: agent.name,
              creator: agent.creator,
              creatorVerified: agent.creatorVerified,
              rating: agent.rating ?? 0,
              weeklyIncome: agent.weeklyIncome,
              apy: agent.apy,
              users: agent.users,
              aum: agent.aum,
              points: agent.points,
              pointsTrend: agent.pointsTrend,
              avatarBg: agent.avatarBg,
              usesBrandedImage: Boolean(agent.imageUrl),
              surfaceTag: agent.surfaceTag,
              rowBg: agent.marketplaceRowBg,
              rowHoverBg: agent.marketplaceRowHoverBg,
              iconUri:
                resolveAgentAvatarUri({
                  imageUrl: agent.imageUrl,
                  protocols: agent.protocols ?? [],
                  tokenIconBySymbol,
                }) ??
                (agent.chains && agent.chains.length > 0
                  ? chainIconByName[normalizeNameKey(agent.chains[0])] ?? null
                  : null),
              isActive: agent.isActive,
              isLoaded: agent.isLoaded,
            }))}
            onAgentClick={(id) => onViewAgent?.(id)}
            onAgentAction={(id) => onHireAgent?.(id)}
          />

          {/* Pagination */}
          {shouldShowPagination ? (
            <Pagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FeaturedAgentCard({
  agent,
  chainItems,
  protocolItems,
  tokenItems,
  avatarUri,
  isMetricsCollapsed,
  onToggleMetrics,
  onClick,
}: {
  agent: FeaturedAgent;
  index: number;
  chainItems: { label: string; iconUri: string | null }[];
  protocolItems: { label: string; iconUri: string | null }[];
  tokenItems: { label: string; iconUri: string | null }[];
  avatarUri: string | null;
  isMetricsCollapsed: boolean;
  onToggleMetrics?: () => void;
  onClick?: () => void;
}) {
  const hasRank = agent.rank !== undefined;
  const hasRating = agent.rating !== undefined && agent.rating > 0;
  const hasCreator = agent.creator !== undefined && agent.creator !== '';
  const hasTrend = agent.trendMultiplier !== undefined && agent.trendMultiplier !== '';
  const cardStyle = agent.marketplaceCardBg
    ? ({
        '--agent-card-bg': agent.marketplaceCardBg,
        '--agent-card-hover-bg': agent.marketplaceCardHoverBg ?? agent.marketplaceCardBg,
      } as CSSProperties)
    : undefined;

  return (
    <div
      onClick={onClick}
      className="min-w-[340px] w-[340px] h-[230px] flex-shrink-0 rounded-2xl border border-[#E3D2BF] bg-[color:var(--agent-card-bg,rgba(255,250,242,0.92))] hover:bg-[color:var(--agent-card-hover-bg,rgba(247,239,227,0.98))] hover:border-[#D4BFA8] transition-colors cursor-pointer overflow-hidden flex flex-col shadow-[0_16px_36px_rgba(103,61,34,0.08)]"
      style={cardStyle}
    >
      {/* Header: avatar + title/subtitle on left, rank/menu on right */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-3">
            <div className="w-[72px] h-[72px] rounded-full flex-shrink-0 overflow-hidden ring-1 ring-[#E3D2BF] bg-[#F6ECDD] flex items-center justify-center">
              <div
                className="h-full w-full flex items-center justify-center bg-[#F6ECDD]"
                style={agent.imageUrl && agent.avatarBg ? { background: agent.avatarBg } : undefined}
              >
              {avatarUri ? (
                <img
                  src={proxyIconUri(avatarUri)}
                  alt=""
                  decoding="async"
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <span className="text-lg font-semibold text-[#6F5A4C]" aria-hidden="true">
                  {iconMonogram(agent.name)}
                </span>
              )}
              </div>
            </div>

            <div className="min-w-0">
              <h3 className="font-medium text-[#241813] text-[15px] leading-5">{agent.name}</h3>
              {(hasCreator || hasRating || agent.surfaceTag) && (
                <div className="mt-0.5">
                  {(hasCreator || hasRating) && (
                    <div className="flex items-center gap-2">
                      {hasCreator && (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-[12px] text-[#A98C74]">by</span>
                          <CreatorIdentity
                            name={agent.creator ?? ''}
                            verified={agent.creatorVerified}
                            size="sm"
                            nameClassName="text-[12px] text-[#6F5A4C]"
                          />
                        </span>
                      )}
                      {hasRating && (
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3 h-3 ${
                                i < Math.floor(agent.rating ?? 0)
                                  ? 'fill-[color:var(--hire-accent)] text-[color:var(--hire-accent)]'
                                  : 'text-[#D2B9A1] fill-[#D2B9A1]'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {agent.surfaceTag ? <AgentSurfaceTag tag={agent.surfaceTag} className="mt-1.5" /> : null}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasRank && <span className="text-xs text-[#A98C74] font-medium">#{agent.rank}</span>}
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded hover:bg-[#F4E6D8] transition-colors"
            >
              <MoreHorizontal className="w-5 h-5 text-[color:var(--hire-accent)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content: icon groups + description */}
      <div className="px-4 pb-2 flex-1 min-h-0 overflow-hidden">
        <div className="flex items-start gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="grid grid-cols-3 gap-3 flex-1">
                <IconGroup
                  title="Chains"
                  items={chainItems}
                />
                <IconGroup
                  title="Protocols"
                  items={protocolItems}
                />
                <IconGroup
                  title="Tokens"
                  items={tokenItems}
                />
              </div>

              {hasTrend ? (
                <div className="flex items-center gap-1.5 bg-[color:var(--hire-accent-soft)] px-2.5 py-1 rounded-full mt-5">
                  <Flame className="w-4 h-4 text-[color:var(--hire-accent)]" />
                  <span className="text-sm font-semibold text-[color:var(--hire-accent)]">
                    {agent.trendMultiplier}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {agent.description ? (
          <p className="text-[11px] leading-4 text-[#7B6758] min-h-8 overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
            {agent.description}
          </p>
        ) : null}
      </div>

      {/* Stats footer */}
      {!isMetricsCollapsed && (
        <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-[#F4E6D8] border-t border-[#E3D2BF]">
          <FeaturedStat
            label="AUM"
            isLoaded={agent.isLoaded}
            value={agent.aum !== undefined ? `$${agent.aum.toLocaleString()}` : null}
          />
          <FeaturedStat
            label="30d Income"
            isLoaded={agent.isLoaded}
            value={agent.weeklyIncome !== undefined ? `$${agent.weeklyIncome.toLocaleString()}` : null}
          />
          <FeaturedStat
            label="APY"
            isLoaded={agent.isLoaded}
            value={agent.apy !== undefined ? `${agent.apy}%` : null}
            valueClassName="text-[#4E7A58]"
          />
          <FeaturedStat
            label="Users"
            isLoaded={agent.isLoaded}
            value={agent.users !== undefined ? agent.users.toLocaleString() : null}
          />
        </div>
      )}

      {/* Expand/collapse chevron */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleMetrics?.();
        }}
        aria-label={isMetricsCollapsed ? 'Expand metrics' : 'Collapse metrics'}
        className="flex w-full justify-center py-1.5 bg-[#F4E6D8] border-t border-[#E3D2BF] hover:bg-[#EEDAC6] transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 text-[#A98C74] transition-transform ${isMetricsCollapsed ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
}

function IconGroup({
  title,
  items,
}: {
  title: string;
  items: { label: string; iconUri: string | null }[];
}) {
  // Keep this compact so we never clip against the card edge.
  // If there is overflow, show 2 icons + an in-row ellipsis "icon" that opens a tooltip.
  const MAX_ICONS = 3;
  const hasOverflow = items.length > MAX_ICONS;
  const displayItems = hasOverflow ? items.slice(0, MAX_ICONS - 1) : items.slice(0, MAX_ICONS);
  const overflowItems = hasOverflow ? items.slice(MAX_ICONS - 1) : [];
  const rendersAsTextTags = displayItems.length > 0 && displayItems.every((item) => item.iconUri === null);

  return (
    <div className="min-w-0">
      <div className="text-[11px] font-mono text-[#A98C74] tracking-wide mb-1">{title}</div>
      <div className="flex items-center min-h-6">
        {rendersAsTextTags ? (
          <div className="flex flex-wrap gap-1.5">
            {displayItems.map((item) => (
              <span
                key={item.label}
                className="inline-flex max-w-full items-center rounded-full bg-[#FFF8F0] px-2 py-1 text-[10px] font-medium leading-none text-[#6F5A4C] ring-1 ring-[#E3D2BF]"
              >
                {item.label}
              </span>
            ))}

            {overflowItems.length > 0 ? (
              <CursorListTooltip title={`${title} (more)`} items={overflowItems}>
                <span className="inline-flex items-center rounded-full bg-[#F4E6D8] px-2 py-1 text-[10px] font-medium leading-none text-[#8A6F58] ring-1 ring-[#E3D2BF] select-none cursor-default">
                  +{overflowItems.length}
                </span>
              </CursorListTooltip>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center -space-x-2">
            {displayItems.map((item) =>
              item.iconUri ? (
                <img
                  key={`${item.label}-${item.iconUri}`}
                  src={proxyIconUri(item.iconUri)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-6 w-6 rounded-full bg-[#F6ECDD] ring-1 ring-[#E3D2BF] object-contain"
                />
              ) : (
                <div
                  key={item.label}
                  className="h-6 w-6 rounded-full bg-[#F6ECDD] ring-1 ring-[#E3D2BF] flex items-center justify-center text-[10px] font-semibold text-[#6F5A4C] select-none"
                  aria-hidden="true"
                >
                  {iconMonogram(item.label)}
                </div>
              ),
            )}

            {overflowItems.length > 0 ? (
              <CursorListTooltip title={`${title} (more)`} items={overflowItems}>
                <div className="h-6 w-6 rounded-full bg-[#F4E6D8] ring-1 ring-[#E3D2BF] flex items-center justify-center text-[12px] text-[#6F5A4C] font-semibold whitespace-nowrap select-none cursor-default">
                  …
                </div>
              </CursorListTooltip>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturedStat({
  label,
  isLoaded,
  value,
  valueClassName = 'text-[#241813]',
}: {
  label: string;
  isLoaded: boolean;
  value: string | null;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-mono text-[#A98C74] tracking-wide mb-0.5">{label}</div>
      {!isLoaded ? (
        <Skeleton className="h-4 w-10" />
      ) : value !== null ? (
          <div className={`font-semibold text-[12px] leading-4 ${valueClassName}`}>{value}</div>
        ) : (
          <div className="text-[#A98C74] font-semibold text-[12px] leading-4">-</div>
        )}
    </div>
  );
}
