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
  visibleInUserLists?: boolean;
  onboardingOwnerAgentId?: string;
  imperativeCommandTransport?: 'message' | 'forwarded-props';
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
    chains: ['Arbitrum'],
    protocols: ['Camelot'],
    tokens: ['USDC', 'WETH', 'WBTC'],
    isFeatured: true,
    featuredRank: 1,
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
    featuredRank: 2,
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
    chains: ['Arbitrum'],
    protocols: ['GMX', 'Allora'],
    tokens: ['USDC', 'WETH'],
    isFeatured: true,
    featuredRank: 3,
  },
  'agent-pi-example': {
    id: 'agent-pi-example',
    name: 'Pi Example Agent',
    description:
      'Pi-native OpenRouter smoke-test agent with a real AG-UI transport, durable Postgres runtime state, and operator control-plane endpoints.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🧪',
    avatarBg: 'linear-gradient(135deg, #0891b2 0%, #2563eb 100%)',
    visibleInUserLists: false,
    imperativeCommandTransport: 'forwarded-props',
    chains: ['Arbitrum'],
    protocols: ['Pi Runtime', 'OpenRouter'],
    tokens: ['USDC'],
  },
  'agent-portfolio-manager': {
    id: 'agent-portfolio-manager',
    name: 'Portfolio Manager',
    description:
      'Concrete PI-runtime orchestrator path for wallet-backed onboarding, signing handoffs, and Shared Ember Domain Service integration.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🧭',
    avatarBg: 'linear-gradient(135deg, #0f766e 0%, #0ea5e9 100%)',
    imperativeCommandTransport: 'forwarded-props',
    chains: ['Arbitrum'],
    protocols: ['Pi Runtime', 'Shared Ember Domain Service'],
    tokens: ['USDC'],
  },
  'agent-ember-lending': {
    id: 'agent-ember-lending',
    name: 'Ember Lending',
    description:
      'Managed lending subagent on the public PI runtime path for bounded Shared Ember portfolio-state reads, plan materialization, execution, and escalation.',
    creator: 'Ember AI Team',
    creatorVerified: true,
    avatar: '🏦',
    avatarBg: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
    onboardingOwnerAgentId: 'agent-portfolio-manager',
    imperativeCommandTransport: 'forwarded-props',
    chains: ['Arbitrum'],
    protocols: ['Pi Runtime', 'Shared Ember Domain Service'],
    tokens: ['USDC'],
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
