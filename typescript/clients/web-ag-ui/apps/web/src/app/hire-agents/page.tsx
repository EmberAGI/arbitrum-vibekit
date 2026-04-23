'use client';

import { HireAgentsPage, type Agent, type FeaturedAgent } from '@/components/HireAgentsPage';
import { useAgentList } from '@/contexts/AgentListContext';
import { getFeaturedAgents, getVisibleAgents } from '@/config/agents';
import type { AgentListEntry } from '@/contexts/agentListTypes';
import { canonicalizeChainLabel } from '@/utils/iconResolution';
import { mergeUniqueStrings, normalizeStringList } from '@/utils/agentCollections';
import { navigateToHref } from '@/utils/hardNavigation';

const PAGINATION_QA_MOCK_COUNT = 27;
const PAGINATION_QA_MOCKS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_HIRE_AGENTS_PAGINATION_MOCKS === 'true';

function deriveMarketplaceAgentStatus(
  listState: AgentListEntry | undefined,
): Pick<Agent, 'status' | 'isActive'> {
  const lifecyclePhase = listState?.lifecyclePhase ?? null;
  const isHired =
    listState?.isHired === true ||
    lifecyclePhase === 'onboarding' ||
    lifecyclePhase === 'active' ||
    lifecyclePhase === 'firing';

  return {
    status: isHired ? 'hired' : 'for_hire',
    isActive: lifecyclePhase === 'active',
  };
}

export default function HireAgentsRoute() {
  const { agents: agentStates } = useAgentList();
  const registeredAgents = getVisibleAgents();
  const featuredAgentConfigs = getFeaturedAgents();

  const agentList: Agent[] = registeredAgents.map((agentConfig) => {
    const listState = agentStates[agentConfig.id];
    const profile = listState?.profile;
    const metrics = listState?.metrics;
    const isLoaded = Boolean(listState?.synced);
    const { status, isActive } = deriveMarketplaceAgentStatus(listState);

    const chains = mergeUniqueStrings({
      primary: normalizeStringList(profile?.chains),
      secondary: normalizeStringList(agentConfig.chains),
      mapFn: canonicalizeChainLabel,
      keyFn: (value) => canonicalizeChainLabel(value).toLowerCase(),
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
      imageUrl: agentConfig.imageUrl,
      surfaceTag: agentConfig.surfaceTag,
      marketplaceCardBg: agentConfig.marketplaceCardBg,
      marketplaceCardHoverBg: agentConfig.marketplaceCardHoverBg,
      marketplaceRowBg: agentConfig.marketplaceRowBg,
      marketplaceRowHoverBg: agentConfig.marketplaceRowHoverBg,
      status,
      isActive,
      isFeatured: agentConfig.isFeatured,
      featuredRank: agentConfig.featuredRank,
      isLoaded,
    };
  });

  const paginationMockAgents: Agent[] = PAGINATION_QA_MOCKS_ENABLED
    ? Array.from({ length: PAGINATION_QA_MOCK_COUNT }, (_, index) => {
        const ordinal = index + 1;
        const paddedOrdinal = ordinal.toString().padStart(2, '0');

        return {
          id: `agent-mock-${paddedOrdinal}`,
          rank: registeredAgents.length + ordinal,
          name: `Mock Strategy ${paddedOrdinal}`,
          creator: 'Ember QA',
          creatorVerified: false,
          rating: undefined,
          weeklyIncome: 150 + ordinal * 11,
          apy: 4 + ((ordinal * 7) % 18),
          users: 20 + ordinal * 3,
          aum: 12_000 + ordinal * 1_250,
          chains: ['Arbitrum'],
          protocols: ordinal % 2 === 0 ? ['Camelot'] : ['Pendle'],
          tokens: ordinal % 3 === 0 ? ['USDC', 'ARB'] : ['USDC', 'WETH'],
          points: ordinal,
          pointsTrend: 'up',
          trendMultiplier: `${ordinal}x`,
          avatar: '🤖',
          avatarBg: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)',
          status: 'for_hire',
          isActive: false,
          isFeatured: false,
          isLoaded: true,
        };
      })
    : [];

  const agentListWithMocks = [...agentList, ...paginationMockAgents];

  // Build featured agents list from config, prioritizing real data when available
  const featuredAgents: FeaturedAgent[] = featuredAgentConfigs.map((config) => {
    const listState = agentStates[config.id];
    const profile = listState?.profile;
    const metrics = listState?.metrics;
    const isLoaded = Boolean(listState?.synced);
    const { status } = deriveMarketplaceAgentStatus(listState);

    const chains = mergeUniqueStrings({
      primary: normalizeStringList(profile?.chains),
      secondary: normalizeStringList(config.chains),
      mapFn: canonicalizeChainLabel,
      keyFn: (value) => canonicalizeChainLabel(value).toLowerCase(),
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
      description: config.description,
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
      imageUrl: config.imageUrl,
      surfaceTag: config.surfaceTag,
      marketplaceCardBg: config.marketplaceCardBg,
      marketplaceCardHoverBg: config.marketplaceCardHoverBg,
      marketplaceRowBg: config.marketplaceRowBg,
      marketplaceRowHoverBg: config.marketplaceRowHoverBg,
      pointsTrend: isLoaded && metrics?.iteration && metrics.iteration > 0 ? 'up' : undefined,
      trendMultiplier: isLoaded && metrics?.iteration ? `${metrics.iteration}x` : undefined,
      status,
      isLoaded,
    };
  });

  const handleHireAgent = (agentId: string) => {
    navigateToHref(`/hire-agents/${agentId}`);
  };

  const handleViewAgent = (agentId: string) => {
    navigateToHref(`/hire-agents/${agentId}`);
  };

  return (
    <HireAgentsPage
      agents={agentListWithMocks}
      featuredAgents={featuredAgents}
      onHireAgent={handleHireAgent}
      onViewAgent={handleViewAgent}
    />
  );
}
