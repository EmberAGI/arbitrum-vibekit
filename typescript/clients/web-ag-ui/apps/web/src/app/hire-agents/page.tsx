'use client';

import { useRouter } from 'next/navigation';
import { HireAgentsPage, type Agent, type FeaturedAgent } from '@/components/HireAgentsPage';
import { useAgentList } from '@/contexts/AgentListContext';
import { getAllAgents, getFeaturedAgents } from '@/config/agents';

export default function HireAgentsRoute() {
  const router = useRouter();
  const { agents: agentStates } = useAgentList();
  const registeredAgents = getAllAgents();
  const featuredAgentConfigs = getFeaturedAgents();

  const agentList: Agent[] = registeredAgents.map((agentConfig) => {
    const listState = agentStates[agentConfig.id];
    const profile = listState?.profile;
    const metrics = listState?.metrics;
    const isLoaded = Boolean(listState?.synced);

    return {
      id: agentConfig.id,
      rank: agentConfig.featuredRank,
      name: agentConfig.name,
      creator: agentConfig.creator,
      creatorVerified: agentConfig.creatorVerified,
      rating: undefined, // Real rating not available
      weeklyIncome: profile?.agentIncome,
      apy: profile?.apy,
      users: profile?.totalUsers,
      aum: profile?.aum,
      points: metrics?.iteration,
      pointsTrend: isLoaded && metrics?.iteration && metrics.iteration > 0 ? 'up' : undefined,
      trendMultiplier: isLoaded && metrics?.iteration ? `${metrics.iteration}x` : undefined,
      avatar: agentConfig.avatar,
      avatarBg: agentConfig.avatarBg,
      status: 'for_hire' as const,
      isActive: false,
      isFeatured: agentConfig.isFeatured,
      featuredRank: agentConfig.featuredRank,
      isLoaded,
    };
  });

  // Build featured agents list from config, prioritizing real data when available
  const featuredAgents: FeaturedAgent[] = featuredAgentConfigs.map((config) => {
    const listState = agentStates[config.id];
    const profile = listState?.profile;
    const metrics = listState?.metrics;
    const isLoaded = Boolean(listState?.synced);

    return {
      id: config.id,
      rank: config.featuredRank,
      name: config.name,
      creator: config.creator,
      creatorVerified: config.creatorVerified,
      rating: undefined, // Real rating not available
      users: profile?.totalUsers,
      aum: profile?.aum,
      apy: profile?.apy,
      weeklyIncome: profile?.agentIncome,
      chains: profile?.chains ?? [],
      protocols: profile?.protocols ?? [],
      avatar: config.avatar,
      avatarBg: config.avatarBg,
      pointsTrend: isLoaded && metrics?.iteration && metrics.iteration > 0 ? 'up' : undefined,
      trendMultiplier: isLoaded && metrics?.iteration ? `${metrics.iteration}x` : undefined,
      status: 'for_hire' as const,
      isLoaded,
    };
  });

  const handleHireAgent = (agentId: string) => {
    router.push(`/hire-agents/${agentId}`);
  };

  const handleViewAgent = (agentId: string) => {
    router.push(`/hire-agents/${agentId}`);
  };

  return (
    <HireAgentsPage
      agents={agentList}
      featuredAgents={featuredAgents}
      onHireAgent={handleHireAgent}
      onViewAgent={handleViewAgent}
    />
  );
}
