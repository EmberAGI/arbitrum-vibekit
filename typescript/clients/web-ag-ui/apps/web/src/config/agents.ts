// Agent registry - static metadata for available agents.
// Runtime data (stats, metrics) comes from CopilotKit state.

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  creator: string;
  creatorVerified: boolean;
  avatar: string;
  avatarBg: string;
  // Featured agents config
  isFeatured?: boolean;
  featuredRank?: number;
}

export const AGENT_REGISTRY: Record<string, AgentConfig> = {
  'agent-clmm': {
    id: 'agent-clmm',
    name: 'Camelot CLMM',
    description:
      'Automatically rebalances and optimizes concentrated liquidity positions on Camelot DEX. Runs continuous rebalancing cycles to keep liquidity dense around price and reduce drift.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🏰',
    avatarBg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    isFeatured: true,
    featuredRank: 1,
  },
  'agent-polymarket': {
    id: 'agent-polymarket',
    name: 'Polymarket Arbitrage',
    description:
      'Automatically finds and executes arbitrage opportunities on Polymarket prediction markets. Monitors YES/NO token prices and executes when combined prices are below $1.00.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🎯',
    avatarBg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    isFeatured: true,
    featuredRank: 2,
  },
};

export function getAgentConfig(agentId: string): AgentConfig {
  if (AGENT_REGISTRY[agentId]) {
    return AGENT_REGISTRY[agentId];
  }

  return {
    id: agentId,
    name: formatAgentName(agentId),
    description: 'AI agent connected via CopilotKit.',
    creator: 'Unknown',
    creatorVerified: false,
    avatar: '🤖',
    avatarBg: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
  };
}

function formatAgentName(agentId: string): string {
  return agentId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getAllAgents(): AgentConfig[] {
  return Object.values(AGENT_REGISTRY);
}

export function getFeaturedAgents(): AgentConfig[] {
  return Object.values(AGENT_REGISTRY)
    .filter((agent) => agent.isFeatured)
    .sort((a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999));
}

export const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID || 'agent-clmm';
