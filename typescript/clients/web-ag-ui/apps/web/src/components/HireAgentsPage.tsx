'use client';

import { SlidersHorizontal, Star, MoreHorizontal, AlertCircle, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { SearchBar } from './ui/SearchBar';
import { FilterTabs } from './ui/FilterTabs';
import { Pagination } from './ui/Pagination';
import { AgentsTable, type AgentTableItem } from './agents/AgentsTable';

export interface Agent {
  id: string;
  rank: number;
  name: string;
  creator: string;
  creatorVerified?: boolean;
  rating: number;
  ratingCount?: number;
  weeklyIncome: number;
  apy: number;
  users: number;
  aum: number;
  points: number;
  pointsTrend?: 'up' | 'down' | 'neutral';
  avatar: string;
  avatarBg: string;
  status: 'for_hire' | 'hired' | 'unavailable';
  isActive?: boolean;
}

export interface FeaturedAgent {
  id: string;
  rank: number;
  name: string;
  creator: string;
  rating: number;
  users: number;
  aum: number;
  apy: number;
  weeklyIncome: number;
  avatar: string;
  avatarBg: string;
  pointsTrend?: 'up' | 'down';
  trendMultiplier?: string;
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
      switch (sortBy) {
        case 'income':
          return b.weeklyIncome - a.weeklyIncome;
        case 'apy':
          return b.apy - a.apy;
        case 'users':
          return b.users - a.users;
        case 'aum':
          return b.aum - a.aum;
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
        <div className="mb-8">
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {featuredAgents.slice(0, 2).map((agent) => (
              <FeaturedAgentCard
                key={agent.id}
                agent={agent}
                onClick={() => onViewAgent?.(agent.id)}
              />
            ))}
          </div>
        </div>

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
          agents={paginatedAgents.map((agent) => ({
            ...agent,
            weeklyIncome: agent.weeklyIncome,
            apy: agent.apy,
            users: agent.users,
            aum: agent.aum,
            points: agent.points,
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
  onClick,
}: {
  agent: FeaturedAgent;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="min-w-[340px] flex-shrink-0 p-5 rounded-2xl bg-gradient-to-br from-[#1e1e1e] to-[#252525] border border-[#2a2a2a] hover:border-[#3a3a3a] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">#{agent.rank}</span>
          <div className="star-rating ml-2">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-3 h-3 ${i < Math.floor(agent.rating) ? 'star fill-yellow-400 text-yellow-400' : 'star-empty'}`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 ml-1">by {agent.creator}</span>
        </div>
        <button className="p-1 hover:bg-[#2a2a2a] rounded transition-colors">
          <MoreHorizontal className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
          style={{ background: agent.avatarBg }}
        >
          {agent.avatar}
        </div>
        <div>
          <h3 className="font-semibold text-white">{agent.name}</h3>
          {agent.pointsTrend && (
            <div className="flex items-center gap-1 mt-0.5">
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  agent.pointsTrend === 'up'
                    ? 'bg-teal-500/20 text-teal-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {agent.trendMultiplier}
              </span>
              {agent.pointsTrend === 'down' && (
                <AlertCircle className="w-3 h-3 text-red-400" />
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div>
          <div className="text-gray-500 text-xs mb-0.5">Users</div>
          <div className="text-white font-medium">{agent.users.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-0.5">7d Agent Income</div>
          <div className="text-white font-medium">${agent.weeklyIncome.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm mt-3 pt-3 border-t border-[#2a2a2a]">
        <div>
          <div className="text-gray-500 text-xs mb-0.5">AUM</div>
          <div className="text-white font-medium">${agent.aum.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-0.5">APY</div>
          <div className="text-teal-400 font-medium">{agent.apy}%</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-0.5">7d Agent Income</div>
          <div className="text-white font-medium">${agent.weeklyIncome.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
