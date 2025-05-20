export const chatAgents = [
  {
    id: 'ember-aave' as const,
    name: 'Lending',
    description: 'AAVE lending agent',
  },
  {
    id: 'ember-camelot' as const,
    name: 'Trading',
    description: 'Camelot Swapping agent',
  },
  {
    id: 'ember-lp' as const,
    name: 'LPing',
    description: 'Camelot Liquidity Provisioning agent',
  },
  {
    id: 'ember-pendle' as const,
    name: 'Pendle',
    description: 'Test agent for Pendle',
  },
  {
    id: 'all' as const,
    name: 'All agents',
    description: 'All agents',
  },
] as const;

export type ChatAgentId = (typeof chatAgents)[number]['id'];
