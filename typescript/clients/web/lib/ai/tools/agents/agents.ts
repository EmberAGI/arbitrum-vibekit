interface ChatAgent {
    id: string;
    name: string;
    description: string;
  }
  
export const chatAgents: Array<ChatAgent> = [
    {
      id: 'ember-aave',
      name: 'Lending',
      description: 'AAVE lending agent',
    },
    {
      id: 'ember-camelot',
      name: 'Trading',
      description: 'Camelot Swapping agent',
  },
  {
    id: 'ember-lp',
    name: 'LPing',
    description: 'Camelot Liquidity Provisioning agent',
  },
  {
    id: 'ember-pendle',
    name: 'Pendle',
    description: 'Test agent for Pendle',
  },
  {
    id: 'all',
    name: 'Default Agent',
    description: 'All agents',
    }
    
  ];