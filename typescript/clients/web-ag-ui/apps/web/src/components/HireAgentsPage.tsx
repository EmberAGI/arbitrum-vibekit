'use client';

/* eslint-disable @next/next/no-img-element */

import { SlidersHorizontal, Star, MoreHorizontal, ChevronDown, Flame } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SearchBar } from './ui/SearchBar';
import { FilterTabs } from './ui/FilterTabs';
import { Pagination } from './ui/Pagination';
import { AgentsTable } from './agents/AgentsTable';
import { Skeleton } from './ui/Skeleton';
import { PROTOCOL_TOKEN_FALLBACK } from '../constants/protocolTokenFallback';
import { useOnchainActionsIconMaps } from '../hooks/useOnchainActionsIconMaps';
import {
  resolveAgentAvatarUri,
  resolveChainIconUris,
  resolveProtocolIconUris,
  resolveTokenIconUris,
  normalizeNameKey,
} from '../utils/iconResolution';

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
}

export function HireAgentsPage({
  agents,
  featuredAgents,
  onHireAgent,
  onViewAgent,
}: HireAgentsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'income' | 'apy' | 'users' | 'aum'>('income');
  const [filterStatus, setFilterStatus] = useState<'all' | 'hired' | 'for_hire'>('for_hire');
  const [currentPage, setCurrentPage] = useState(1);

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
      if (a.id === 'agent-clmm' && b.id !== 'agent-clmm') {
        return -1;
      }
      if (b.id === 'agent-clmm' && a.id !== 'agent-clmm') {
        return 1;
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
  const paginatedAgents = filteredAgents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const desiredChainNames = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    for (const agent of agents) {
      for (const chain of agent.chains ?? []) {
        if (seen.has(chain)) continue;
        seen.add(chain);
        out.push(chain);
      }
    }

    for (const agent of featuredAgents) {
      for (const chain of agent.chains ?? []) {
        if (seen.has(chain)) continue;
        seen.add(chain);
        out.push(chain);
      }
    }

    return out;
  }, [agents, featuredAgents]);

  const desiredTokenSymbols = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();

    const addSymbol = (symbol: string | undefined) => {
      if (!symbol) return;
      const trimmed = symbol.trim();
      if (trimmed.length === 0) return;
      if (seen.has(trimmed)) return;
      seen.add(trimmed);
      out.push(trimmed);
    };

    for (const agent of agents) {
      for (const token of agent.tokens ?? []) addSymbol(token);
      for (const protocol of agent.protocols ?? []) addSymbol(PROTOCOL_TOKEN_FALLBACK[protocol]);
    }

    for (const agent of featuredAgents) {
      for (const protocol of agent.protocols ?? []) addSymbol(PROTOCOL_TOKEN_FALLBACK[protocol]);
      for (const token of agent.tokens ?? []) addSymbol(token);
    }

    return out;
  }, [agents, featuredAgents]);

  const { chainIconByName, tokenIconBySymbol, isLoaded: iconsLoaded } = useOnchainActionsIconMaps({
    chainNames: desiredChainNames,
    tokenSymbols: desiredTokenSymbols,
  });

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Page Header */}
        <h1 className="text-3xl font-bold text-white mb-8">Hire Agents</h1>

        {/* Banner CTA */}
        <div className="relative mb-8 rounded-2xl overflow-hidden bg-gradient-to-r from-[#1a1a2e] to-[#2d2d44]">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzMzMyIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20" />
          </div>
          <div className="relative flex items-center justify-between p-6">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-600 to-gray-700 rounded-lg flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-yellow-400" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">
                  Publish your agent for hire
                </h2>
                <p className="text-gray-400 text-sm">
                  Your agent earns for it&apos;s services. And so do you.
                </p>
              </div>
            </div>
            <button className="px-6 py-2.5 rounded-lg bg-[#fd6731] hover:bg-[#e55a28] text-white font-medium transition-colors">
              Publish
            </button>
          </div>
        </div>

        {/* Featured Agents Carousel */}
        {displayFeaturedAgents.length > 0 && (
          <div className="mb-8">
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {displayFeaturedAgents.map((agent, index) => {
                const chainIconUris = resolveChainIconUris({
                  chainNames: agent.chains ?? [],
                  chainIconByName,
                });
                const avatarUri =
                  resolveAgentAvatarUri({
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
                    iconsLoaded={iconsLoaded}
                    chainIconUris={chainIconUris}
                    protocolIconUris={resolveProtocolIconUris({
                      protocols: agent.protocols ?? [],
                      tokenIconBySymbol,
                    })}
                    tokenIconUris={resolveTokenIconUris({
                      tokenSymbols: agent.tokens ?? [],
                      tokenIconBySymbol,
                    })}
                    avatarUri={avatarUri}
                    onClick={() => onViewAgent?.(agent.id)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex items-center gap-4 mb-6">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search" />

          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="appearance-none flex items-center gap-2 px-4 py-2.5 pr-8 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors text-sm cursor-pointer focus:outline-none focus:border-[#fd6731]"
              >
                <option value="income">Sort by: Income</option>
                <option value="apy">Sort by: APY</option>
                <option value="users">Sort by: Users</option>
                <option value="aum">Sort by: AUM</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            </div>

            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1e1e1e] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors">
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-sm">Filter</span>
            </button>
          </div>

          {/* Filter Tabs */}
          <FilterTabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'hired', label: 'Hired', count: hiredCount, color: 'bg-teal-500/20 text-teal-400' },
              { id: 'for_hire', label: 'For Hire', count: forHireCount, color: 'bg-[#fd6731]/20 text-[#fd6731]' },
            ]}
            activeTab={filterStatus}
            onTabChange={(tab) => setFilterStatus(tab as typeof filterStatus)}
          />
        </div>

        {/* Agents Table */}
        <AgentsTable
          iconsLoaded={iconsLoaded}
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
            iconUri: resolveAgentAvatarUri({
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
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}

function FeaturedAgentCard({
  agent,
  iconsLoaded,
  chainIconUris,
  protocolIconUris,
  tokenIconUris,
  avatarUri,
  onClick,
}: {
  agent: FeaturedAgent;
  index: number;
  iconsLoaded: boolean;
  chainIconUris: string[];
  protocolIconUris: string[];
  tokenIconUris: string[];
  avatarUri: string | null;
  onClick?: () => void;
}) {
  const hasRank = agent.rank !== undefined;
  const hasRating = agent.rating !== undefined && agent.rating > 0;
  const hasCreator = agent.creator !== undefined && agent.creator !== '';
  const hasTrend = agent.trendMultiplier !== undefined && agent.trendMultiplier !== '';

  return (
    <div
      onClick={onClick}
      className="min-w-[340px] w-[340px] flex-shrink-0 rounded-xl bg-[#1c1c1c] hover:bg-[#222] transition-all cursor-pointer overflow-hidden"
    >
      {/* Header row: rank, stars, creator, menu */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 text-sm">
          {hasRank && (
            <span className="text-gray-500 font-medium">#{agent.rank}</span>
          )}
          {hasRating && (
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${
                    i < Math.floor(agent.rating ?? 0)
                      ? 'fill-[#fd6731] text-[#fd6731]'
                      : 'text-gray-700 fill-gray-700'
                  }`}
                />
              ))}
            </div>
          )}
          {hasCreator && (
            <span className="text-gray-500">
              by <span className="text-white">{agent.creator}</span>
            </span>
          )}
        </div>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded hover:bg-[#333] transition-colors"
        >
          <MoreHorizontal className="w-5 h-5 text-[#fd6731]" />
        </button>
      </div>

      {/* Main content: Name and avatar */}
      <div className="px-4 pb-4">
        <h3 className="font-bold text-white text-lg leading-snug mb-3">
          {agent.name}
        </h3>

        <div className="flex items-start gap-4">
          {/* Large circular avatar */}
          {!iconsLoaded ? (
            <Skeleton className="h-[72px] w-[72px] rounded-full ring-2 ring-[#333] ring-offset-2 ring-offset-[#1c1c1c]" />
          ) : (
            <div className="w-[72px] h-[72px] rounded-full flex-shrink-0 overflow-hidden ring-2 ring-[#333] ring-offset-2 ring-offset-[#1c1c1c] bg-[#111]">
              {avatarUri ? (
                <img src={avatarUri} alt="" decoding="async" className="h-full w-full object-cover" />
              ) : null}
            </div>
          )}

          {/* Icon groups to the right of the avatar */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="grid grid-cols-3 gap-3 flex-1">
                <IconGroup
                  title="Chains"
                  iconsLoaded={iconsLoaded}
                  uris={chainIconUris}
                />
                <IconGroup
                  title="Protocols"
                  iconsLoaded={iconsLoaded}
                  uris={protocolIconUris}
                />
                <IconGroup
                  title="Tokens"
                  iconsLoaded={iconsLoaded}
                  uris={tokenIconUris}
                />
              </div>

              {/* Trend badge */}
              {hasTrend ? (
                <div className="flex items-center gap-1.5 bg-[#fd6731]/15 px-2.5 py-1 rounded-full mt-5">
                  <Flame className="w-4 h-4 text-[#fd6731]" />
                  <span className="text-sm font-semibold text-[#fd6731]">
                    {agent.trendMultiplier}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Stats footer */}
      <div className="grid grid-cols-4 gap-3 px-4 py-3 bg-[#161616] border-t border-[#2a2a2a]">
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
          valueClassName="text-teal-400"
        />
        <FeaturedStat
          label="Users"
          isLoaded={agent.isLoaded}
          value={agent.users !== undefined ? agent.users.toLocaleString() : null}
        />
      </div>

      {/* Expand chevron */}
      <div className="flex justify-center py-1.5 bg-[#161616] border-t border-[#222]">
        <ChevronDown className="w-4 h-4 text-gray-600" />
      </div>
    </div>
  );
}

function IconGroup({
  title,
  iconsLoaded,
  uris,
}: {
  title: string;
  iconsLoaded: boolean;
  uris: string[];
}) {
  const displayUris = uris.slice(0, 4);
  const remainingCount = Math.max(0, uris.length - displayUris.length);

  return (
    <div className="min-w-0">
      <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">{title}</div>
      <div className="flex items-center gap-1.5 min-h-6 overflow-hidden">
        {!iconsLoaded ? (
          <>
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </>
        ) : (
          <>
            {displayUris.map((uri) => (
              <img
                key={uri}
                src={uri}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-6 w-6 rounded-full bg-[#111] ring-1 ring-[#2a2a2a] object-contain"
              />
            ))}
            {remainingCount > 0 ? (
              <div className="h-6 px-2 rounded-full bg-[#111] ring-1 ring-[#2a2a2a] flex items-center justify-center text-[11px] text-gray-300 font-medium whitespace-nowrap">
                +{remainingCount}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function FeaturedStat({
  label,
  isLoaded,
  value,
  valueClassName = 'text-white',
}: {
  label: string;
  isLoaded: boolean;
  value: string | null;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">{label}</div>
      {!isLoaded ? (
        <Skeleton className="h-5 w-14" />
      ) : value !== null ? (
          <div className={`font-semibold text-base ${valueClassName}`}>{value}</div>
        ) : (
          <div className="text-gray-500 font-semibold text-base">-</div>
        )}
    </div>
  );
}
