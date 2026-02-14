'use client';

import { useRouter } from 'next/navigation';
import { HireAgentsPage, type Agent, type FeaturedAgent } from '@/components/HireAgentsPage';
import { useAgentList } from '@/contexts/AgentListContext';
import { getAllAgents, getFeaturedAgents } from '@/config/agents';

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
}

function mergeUniqueStrings(params: {
  primary: string[];
  secondary: string[];
  keyFn: (value: string) => string;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    const key = params.keyFn(trimmed);
    if (key.length === 0) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const value of params.primary) push(value);
  for (const value of params.secondary) push(value);
  return out;
}

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

    const chains = mergeUniqueStrings({
      primary: normalizeStringList(profile?.chains),
      secondary: normalizeStringList(agentConfig.chains),
      keyFn: (value) => value.toLowerCase(),
    });
    const protocols = mergeUniqueStrings({
      primary: normalizeStringList(profile?.protocols),
      secondary: normalizeStringList(agentConfig.protocols),
      keyFn: (value) => value.toLowerCase(),
    });
    const tokens = mergeUniqueStrings({
      primary: normalizeStringList(profile?.tokens),
      secondary: normalizeStringList(agentConfig.tokens),
      keyFn: (value) => value.toUpperCase(),
    });

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
      chains,
      protocols,
      tokens,
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

    const chains = mergeUniqueStrings({
      primary: normalizeStringList(profile?.chains),
      secondary: normalizeStringList(config.chains),
      keyFn: (value) => value.toLowerCase(),
    });
    const protocols = mergeUniqueStrings({
      primary: normalizeStringList(profile?.protocols),
      secondary: normalizeStringList(config.protocols),
      keyFn: (value) => value.toLowerCase(),
    });
    const tokens = mergeUniqueStrings({
      primary: normalizeStringList(profile?.tokens),
      secondary: normalizeStringList(config.tokens),
      keyFn: (value) => value.toUpperCase(),
    });

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
      chains,
      protocols,
      tokens,
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
