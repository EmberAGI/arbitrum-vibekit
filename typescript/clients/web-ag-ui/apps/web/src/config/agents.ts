/**
 * Agent Configuration System
 *
 * This file defines the available agents and their base metadata.
 * All runtime data (stats, metrics, etc.) comes from CopilotKit state.
 * Only static metadata that doesn't change is defined here.
 */

export interface AgentConfig {
  /** Unique identifier matching the CopilotKit agent name */
  id: string;
  /** Display name for the agent */
  name: string;
  /** Short description of what the agent does */
  description: string;
  /** Creator/team name */
  creator: string;
  /** Whether the creator is verified */
  creatorVerified: boolean;
  /** Emoji or image URL for the agent avatar */
  avatar: string;
  /** CSS gradient or color for avatar background */
  avatarBg: string;
}

/**
 * Registry of available agents.
 * Add new agents here as they become available.
 */
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
  },
  // Add more agents here as they become available:
  // 'agent-arbitrage': {
  //   id: 'agent-arbitrage',
  //   name: 'Cross-Chain Arbitrage',
  //   description: 'Finds and executes arbitrage opportunities across multiple networks.',
  //   creator: 'Ember AI Team',
  //   creatorVerified: true,
  //   avatar: '⚡',
  //   avatarBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  // },
};

/**
 * Get agent configuration by ID.
 * Returns a default configuration if the agent is not in the registry.
 */
export function getAgentConfig(agentId: string): AgentConfig {
  if (AGENT_REGISTRY[agentId]) {
    return AGENT_REGISTRY[agentId];
  }

  // Return a default config for unknown agents
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

/**
 * Format an agent ID into a readable name.
 * e.g., "agent-clmm" -> "Agent Clmm"
 */
function formatAgentName(agentId: string): string {
  return agentId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get all registered agents as an array.
 */
export function getAllAgents(): AgentConfig[] {
  return Object.values(AGENT_REGISTRY);
}

/**
 * The default agent to connect to.
 * This can be made configurable via environment variables.
 */
export const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID || 'agent-clmm';

