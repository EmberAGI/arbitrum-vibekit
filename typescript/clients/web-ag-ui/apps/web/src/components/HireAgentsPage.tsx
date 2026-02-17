'use client';

import { SlidersHorizontal, Star, MoreHorizontal, ChevronDown, Flame } from 'lucide-react';
import { useState, useMemo } from 'react';
import { SearchBar } from './ui/SearchBar';
import { FilterTabs } from './ui/FilterTabs';
import { Pagination } from './ui/Pagination';
import { AgentsTable } from './agents/AgentsTable';

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
  status: 'for_hire' | 'hired' | 'unavailable';
  isActive?: boolean;
  isFeatured?: boolean;
  featuredRank?: number;
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
  avatar?: string;
  avatarBg?: string;
  imageUrl?: string;
  pointsTrend?: 'up' | 'down';
  trendMultiplier?: string;
  status: 'for_hire' | 'hired' | 'unavailable';
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
              {displayFeaturedAgents.map((agent, index) => (
                <FeaturedAgentCard
                  key={agent.id}
                  agent={agent}
                  index={index}
                  onClick={() => onViewAgent?.(agent.id)}
                />
              ))}
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
              {
                id: 'hired',
                label: 'Hired',
                count: hiredCount,
                color: 'bg-teal-500/20 text-teal-400',
              },
              {
                id: 'for_hire',
                label: 'For Hire',
                count: forHireCount,
                color: 'bg-[#fd6731]/20 text-[#fd6731]',
              },
            ]}
            activeTab={filterStatus}
            onTabChange={(tab) => setFilterStatus(tab as typeof filterStatus)}
          />
        </div>

        {/* Agents Table */}
        <AgentsTable
          agents={paginatedAgents.map((agent, index) => ({
            ...agent,
            rank: agent.rank ?? index + 1,
            weeklyIncome: agent.weeklyIncome ?? 0,
            apy: agent.apy ?? 0,
            users: agent.users ?? 0,
            aum: agent.aum ?? 0,
            points: agent.points ?? 0,
            rating: agent.rating ?? 0,
            avatar: agent.avatar ?? '🤖',
            avatarBg: agent.avatarBg ?? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
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

// Generate a beautiful, vibrant abstract SVG pattern based on agent ID
function generateAbstractPattern(agentId: string): string {
  // Create a deterministic hash from the agent ID
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    const char = agentId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  // Generate a vibrant rainbow-like color palette
  const baseHue = Math.abs(hash % 360);
  const colors = [
    `hsl(${baseHue}, 85%, 55%)`,
    `hsl(${(baseHue + 60) % 360}, 80%, 50%)`,
    `hsl(${(baseHue + 120) % 360}, 75%, 60%)`,
    `hsl(${(baseHue + 180) % 360}, 85%, 55%)`,
    `hsl(${(baseHue + 240) % 360}, 80%, 50%)`,
    `hsl(${(baseHue + 300) % 360}, 75%, 60%)`,
  ];

  // Create flowing wave/blob shapes
  const blobs: string[] = [];
  const numBlobs = 5 + Math.abs((hash >> 4) % 3);

  for (let i = 0; i < numBlobs; i++) {
    const seed1 = Math.abs((hash >> (i * 4)) % 1000) / 1000;
    const seed2 = Math.abs((hash >> (i * 4 + 2)) % 1000) / 1000;
    const color = colors[i % colors.length];

    // Create organic blob using bezier curves
    const cx = 20 + seed1 * 60;
    const cy = 20 + seed2 * 60;
    const size = 25 + seed1 * 35;

    // Generate control points for organic shape
    const p1 = { x: cx - size * 0.5, y: cy - size * 0.8 };
    const p2 = { x: cx + size * 0.8, y: cy - size * 0.3 };
    const p3 = { x: cx + size * 0.5, y: cy + size * 0.7 };
    const p4 = { x: cx - size * 0.7, y: cy + size * 0.4 };

    const path = `M ${p1.x} ${p1.y}
      Q ${p1.x + size * 0.5} ${p1.y - size * 0.3} ${p2.x} ${p2.y}
      Q ${p2.x + size * 0.3} ${p2.y + size * 0.5} ${p3.x} ${p3.y}
      Q ${p3.x - size * 0.5} ${p3.y + size * 0.2} ${p4.x} ${p4.y}
      Q ${p4.x - size * 0.2} ${p4.y - size * 0.4} ${p1.x} ${p1.y}`;

    blobs.push(`<path d="${path}" fill="${color}" opacity="${0.7 + seed1 * 0.3}"/>`);
  }

  // Add some accent circles
  const accents: string[] = [];
  for (let i = 0; i < 3; i++) {
    const seed = Math.abs((hash >> (i * 7 + 20)) % 1000) / 1000;
    const x = 15 + seed * 70;
    const y = 15 + ((seed * 2.3) % 1) * 70;
    const r = 5 + seed * 12;
    accents.push(
      `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${0.15 + seed * 0.2}"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="grad-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${colors[0]}"/>
        <stop offset="50%" stop-color="${colors[2]}"/>
        <stop offset="100%" stop-color="${colors[4]}"/>
      </linearGradient>
      <filter id="glow-${hash}">
        <feGaussianBlur in="SourceGraphic" stdDeviation="4"/>
      </filter>
    </defs>
    <rect width="100" height="100" fill="url(#grad-${hash})"/>
    <g filter="url(#glow-${hash})">${blobs.join('')}</g>
    ${accents.join('')}
  </svg>`;

  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function FeaturedAgentCard({
  agent,
  onClick,
}: {
  agent: FeaturedAgent;
  index: number;
  onClick?: () => void;
}) {
  const placeholderImage = useMemo(() => generateAbstractPattern(agent.id), [agent.id]);
  const imageUrl = agent.imageUrl || placeholderImage;

  const hasRank = agent.rank !== undefined;
  const hasRating = agent.rating !== undefined && agent.rating > 0;
  const hasCreator = agent.creator !== undefined && agent.creator !== '';
  const hasUsers = agent.users !== undefined && agent.users > 0;
  const hasWeeklyIncome = agent.weeklyIncome !== undefined && agent.weeklyIncome > 0;
  const hasTrend = agent.trendMultiplier !== undefined && agent.trendMultiplier !== '';

  return (
    <div
      onClick={onClick}
      className="min-w-[340px] w-[340px] flex-shrink-0 rounded-xl bg-[#1c1c1c] hover:bg-[#222] transition-all cursor-pointer overflow-hidden"
    >
      {/* Header row: rank, stars, creator, menu */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 text-sm">
          {hasRank && <span className="text-gray-500 font-medium">#{agent.rank}</span>}
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
        <h3 className="font-bold text-white text-lg leading-snug mb-3">{agent.name}</h3>

        <div className="flex items-center gap-3">
          {/* Large circular avatar */}
          <div
            className="w-[72px] h-[72px] rounded-full flex-shrink-0 overflow-hidden ring-2 ring-[#333] ring-offset-2 ring-offset-[#1c1c1c]"
            style={{
              backgroundImage: `url("${imageUrl}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />

          {/* Trend badge */}
          {hasTrend && (
            <div className="flex items-center gap-1.5 bg-[#fd6731]/15 px-2.5 py-1 rounded-full">
              <Flame className="w-4 h-4 text-[#fd6731]" />
              <span className="text-sm font-semibold text-[#fd6731]">{agent.trendMultiplier}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats footer */}
      <div className="flex items-center gap-8 px-4 py-3 bg-[#161616] border-t border-[#2a2a2a]">
        <div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Users</div>
          <div className="text-white font-semibold text-base">
            {hasUsers ? agent.users?.toLocaleString() : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">
            7d Agent Income
          </div>
          <div className="text-white font-semibold text-base">
            {hasWeeklyIncome ? `$${agent.weeklyIncome?.toLocaleString()}` : '—'}
          </div>
        </div>
      </div>

      {/* Expand chevron */}
      <div className="flex justify-center py-1.5 bg-[#161616] border-t border-[#222]">
        <ChevronDown className="w-4 h-4 text-gray-600" />
      </div>
    </div>
  );
}
