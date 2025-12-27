'use client';

import { useRouter } from 'next/navigation';
import { HireAgentsPage, type Agent, type FeaturedAgent } from '@/components/HireAgentsPage';
import { useAgentConnection } from '@/hooks/useAgentConnection';
import { DEFAULT_AGENT_ID, getAllAgents, getFeaturedAgents } from '@/config/agents';

export default function HireAgentsRoute() {
  const router = useRouter();
  const agent = useAgentConnection(DEFAULT_AGENT_ID);
  const registeredAgents = getAllAgents();
  const featuredAgentConfigs = getFeaturedAgents();

  const agentList: Agent[] = registeredAgents.map((agentConfig) => {
    if (agentConfig.id === DEFAULT_AGENT_ID) {
      // Connected agent - use real data from state
      return {
        id: agentConfig.id,
        rank: agentConfig.featuredRank ?? 1,
        name: agentConfig.name,
        creator: agentConfig.creator,
        creatorVerified: agentConfig.creatorVerified,
        rating: undefined, // Real rating not available
        weeklyIncome: agent.profile.agentIncome,
        apy: agent.profile.apy,
        users: agent.profile.totalUsers,
        aum: agent.profile.aum,
        points: agent.metrics.iteration,
        pointsTrend: agent.metrics.iteration && agent.metrics.iteration > 0 ? 'up' : undefined,
        trendMultiplier: agent.metrics.iteration ? `${agent.metrics.iteration}x` : undefined,
        avatar: agentConfig.avatar,
        avatarBg: agentConfig.avatarBg,
        status: agent.isHired ? 'hired' : 'for_hire',
        isActive: agent.isActive,
        isFeatured: agentConfig.isFeatured,
        featuredRank: agentConfig.featuredRank,
      };
    }

    // Other registered agents - no live data available
    return {
      id: agentConfig.id,
      rank: agentConfig.featuredRank,
      name: agentConfig.name,
      creator: agentConfig.creator,
      creatorVerified: agentConfig.creatorVerified,
      avatar: agentConfig.avatar,
      avatarBg: agentConfig.avatarBg,
      status: 'unavailable' as const,
      isActive: false,
      isFeatured: agentConfig.isFeatured,
      featuredRank: agentConfig.featuredRank,
    };
  });

  // Build featured agents list from config, prioritizing real data when available
  const featuredAgents: FeaturedAgent[] = featuredAgentConfigs.map((config) => {
    if (config.id === DEFAULT_AGENT_ID) {
      // Use real data from connected agent
      return {
        id: config.id,
        rank: config.featuredRank,
        name: config.name,
        creator: config.creator,
        creatorVerified: config.creatorVerified,
        rating: undefined, // Real rating not available
        users: agent.profile.totalUsers,
        aum: agent.profile.aum,
        apy: agent.profile.apy,
        weeklyIncome: agent.profile.agentIncome,
        avatar: config.avatar,
        avatarBg: config.avatarBg,
        pointsTrend: agent.metrics.iteration && agent.metrics.iteration > 0 ? 'up' : undefined,
        trendMultiplier: agent.metrics.iteration ? `${agent.metrics.iteration}x` : undefined,
        status: agent.isHired ? 'hired' : 'for_hire',
      };
    }

    // Other featured agents - config only, no live data
    return {
      id: config.id,
      rank: config.featuredRank,
      name: config.name,
      creator: config.creator,
      creatorVerified: config.creatorVerified,
      avatar: config.avatar,
      avatarBg: config.avatarBg,
      status: 'unavailable' as const,
    };
  });

  const handleHireAgent = (agentId: string) => {
    if (agentId === agent.config.id) {
      agent.runHire();
    }
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
