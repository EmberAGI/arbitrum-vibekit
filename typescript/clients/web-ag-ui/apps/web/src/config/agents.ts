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
    },
    'agent-gmx': {
        id: 'agent-gmx',
        name: 'GMX Agent',
        description:
            'Automatically trades GMX perpetuals using predictive signals. Opens and manages long or short positions directly from your wallet using delegated execution.',
        creator: 'Ember AI Team',
        creatorVerified: true,
        avatar: '📈',
        avatarBg: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
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

export const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID || 'agent-gmx'; // "agent-gmx" | "agent-clmm"
