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

export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([

  ['ember-aave', 'http://173.230.139.151:3010/sse'],
  ['ember-camelot', 'http://173.230.139.151:3011/sse'],
  ['ember-lp', 'http://173.230.139.151:3012/sse'],
  ['ember-pendle', 'http://173.230.139.151:3013/sse'],

]);

export type ChatAgentId = (typeof chatAgents)[number]['id'];
