'use client';

import { useRouter } from 'next/navigation';
import { HireAgentsPage, type Agent, type FeaturedAgent } from '@/components/HireAgentsPage';
import { useAgentConnection } from '@/hooks/useAgentConnection';
import { DEFAULT_AGENT_ID, getAllAgents } from '@/config/agents';

export default function HireAgentsRoute() {
  const router = useRouter();
  const agent = useAgentConnection(DEFAULT_AGENT_ID);
  const registeredAgents = getAllAgents();

  const agentList: Agent[] = registeredAgents.map((agentConfig) => {
    if (agentConfig.id === DEFAULT_AGENT_ID) {
      return {
        id: agentConfig.id,
        rank: 1,
        name: agentConfig.name,
        creator: agentConfig.creator,
        creatorVerified: agentConfig.creatorVerified,
        rating: 5,
        weeklyIncome: agent.profile.agentIncome ?? 0,
        apy: agent.profile.apy ?? 0,
        users: agent.profile.totalUsers ?? 0,
        aum: agent.profile.aum ?? 0,
        points: agent.metrics.iteration ?? 0,
        avatar: agentConfig.avatar,
        avatarBg: agentConfig.avatarBg,
        status: agent.isHired ? 'hired' : 'for_hire',
        isActive: agent.isActive,
      };
    }

    return {
      id: agentConfig.id,
      rank: 0,
      name: agentConfig.name,
      creator: agentConfig.creator,
      creatorVerified: agentConfig.creatorVerified,
      rating: 0,
      weeklyIncome: 0,
      apy: 0,
      users: 0,
      aum: 0,
      points: 0,
      avatar: agentConfig.avatar,
      avatarBg: agentConfig.avatarBg,
      status: 'unavailable' as const,
      isActive: false,
    };
  });

  const featuredAgents: FeaturedAgent[] = [
    {
      id: agent.config.id,
      rank: 1,
      name: agent.config.name,
      creator: agent.config.creator,
      rating: 5,
      users: agent.profile.totalUsers ?? 0,
      aum: agent.profile.aum ?? 0,
      apy: agent.profile.apy ?? 0,
      weeklyIncome: agent.profile.agentIncome ?? 0,
      avatar: agent.config.avatar,
      avatarBg: agent.config.avatarBg,
    },
  ];

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
