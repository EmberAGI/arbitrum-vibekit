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
  imageUrl?: string;
  marketplaceCardBg?: string;
  marketplaceCardHoverBg?: string;
  marketplaceRowBg?: string;
  marketplaceRowHoverBg?: string;
  surfaceTag?: 'Swarm' | 'Workflow';
  visibleInUserLists?: boolean;
  onboardingOwnerAgentId?: string;
  imperativeCommandTransport?: 'message' | 'forwarded-props';
  settingsRefreshTransport?: 'refresh-command' | 'shared-state-update';
  // Static metadata used for pre-auth and degraded modes before runtime stream data arrives.
  chains?: string[];
  protocols?: string[];
  tokens?: string[];
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
    surfaceTag: 'Workflow',
    imperativeCommandTransport: 'forwarded-props',
    settingsRefreshTransport: 'refresh-command',
    chains: ['Arbitrum'],
    protocols: ['Camelot'],
    tokens: ['USDC', 'WETH', 'WBTC'],
    isFeatured: true,
    featuredRank: 3,
  },
  'agent-pendle': {
    id: 'agent-pendle',
    name: 'Pendle Yield',
    description:
      'Automatically allocates stablecoins into the highest-yielding Pendle YT markets and rotates when yields shift.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🪙',
    avatarBg: 'linear-gradient(135deg, #f97316 0%, #facc15 100%)',
    surfaceTag: 'Workflow',
    imperativeCommandTransport: 'forwarded-props',
    settingsRefreshTransport: 'refresh-command',
    chains: ['Arbitrum'],
    protocols: ['Pendle'],
    tokens: [
      'USDai',
      'sUSDai',
      'reUSD',
      'NUSD',
      'rUSD',
      'yzUSD',
      'ysUSDC',
      'upUSDC',
      'USD3',
      'jrUSDe',
      'iUSD',
      'syrupUSDC',
      'syrupUSDT',
      'USDe',
    ],
    isFeatured: true,
    featuredRank: 4,
  },
  'agent-gmx-allora': {
    id: 'agent-gmx-allora',
    name: 'GMX Allora Trader',
    description:
      'Trades GMX perps on Arbitrum using Allora 8-hour prediction feeds with strict low-leverage controls.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '📈',
    avatarBg: 'linear-gradient(135deg, #10b981 0%, #22c55e 100%)',
    surfaceTag: 'Workflow',
    imperativeCommandTransport: 'forwarded-props',
    settingsRefreshTransport: 'refresh-command',
    chains: ['Arbitrum'],
    protocols: ['GMX', 'Allora'],
    tokens: ['USDC', 'WETH'],
    isFeatured: true,
    featuredRank: 5,
  },
  'agent-portfolio-manager': {
    id: 'agent-portfolio-manager',
    name: 'Ember Portfolio Agent',
    description:
      'Orchestrates a swarm of hired agents, enforces your mandate policies autonomously, and works in the background to keep your portfolio aligned with the goals and constraints you set.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🧭',
    avatarBg: 'linear-gradient(135deg, #2d1710 0%, #120a07 100%)',
    imageUrl: 'https://www.emberai.xyz/Logo.svg?dpl=dpl_J6BA6gqb9V9kgyUjTjKdpkPToAd7',
    marketplaceCardBg: 'rgba(124,58,237,0.10)',
    marketplaceCardHoverBg: 'rgba(124,58,237,0.14)',
    marketplaceRowBg: 'rgba(124,58,237,0.08)',
    marketplaceRowHoverBg: 'rgba(124,58,237,0.12)',
    surfaceTag: 'Swarm',
    imperativeCommandTransport: 'forwarded-props',
    settingsRefreshTransport: 'shared-state-update',
    chains: ['Arbitrum'],
    protocols: ['Pi Runtime', 'Shared Ember Domain Service'],
    tokens: ['USDC'],
    isFeatured: true,
    featuredRank: 1,
  },
  'agent-ember-lending': {
    id: 'agent-ember-lending',
    name: 'Ember Lending',
    description:
      'Executes lending strategies within the mandates you approve, monitors positions in the background, and keeps capital deployed within your policy and risk limits.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🏦',
    avatarBg: '#9896FF',
    imageUrl: '/ember-lending-avatar.svg',
    surfaceTag: 'Swarm',
    onboardingOwnerAgentId: 'agent-portfolio-manager',
    imperativeCommandTransport: 'forwarded-props',
    settingsRefreshTransport: 'shared-state-update',
    chains: ['Arbitrum'],
    protocols: ['Aave'],
    tokens: ['USDC'],
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

export function getVisibleAgents(): AgentConfig[] {
  return getAllAgents().filter((agent) => agent.visibleInUserLists !== false);
}

export function isRegisteredAgentId(agentId: string): boolean {
  return Boolean(AGENT_REGISTRY[agentId]);
}

export function getFeaturedAgents(): AgentConfig[] {
  return getVisibleAgents()
    .filter((agent) => agent.isFeatured)
    .sort((a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999));
}

export const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID || 'agent-clmm';
