export const chatAgents = [
  // {
  //   id: 'ember-aave' as const,
  //   name: 'Lending',
  //   description: 'AAVE lending agent',
  //   suggestedActions: [
  //     {
  //       title: 'Deposit WETH',
  //       label: 'to my balance',
  //       action: 'Deposit WETH to my balance',
  //     },
  //     { title: 'Check', label: 'balance', action: 'Check balance' },
  //   ],
  // },
  // {
  //   id: 'ember-camelot' as const,
  //   name: 'Trading',
  //   description: 'Camelot Swapping agent',
  //   suggestedActions: [
  //     {
  //       title: 'Swap USDC for ETH',
  //       label: 'on Arbitrum Network.',
  //       action: 'Swap USDC for ETH tokens from Arbitrum to Arbitrum.',
  //     },
  //     {
  //       title: 'Buy ARB',
  //       label: 'on Arbitrum.',
  //       action: 'Buy ARB token.',
  //     },
  //   ],
  // },
  // {
  //   id: 'langgraph-workflow' as const,
  //   name: 'Greeting Optimizer',
  //   description: 'LangGraph workflow agent that optimizes greetings',
  //   suggestedActions: [
  //     {
  //       title: 'Optimize',
  //       label: 'hello',
  //       action: 'Optimize: hello',
  //     },
  //     {
  //       title: 'Make',
  //       label: 'hi better',
  //       action: 'Make this greeting better: hi',
  //     },
  //     {
  //       title: 'Improve',
  //       label: 'good morning',
  //       action: 'Optimize: good morning',
  //     },
  //   ],
  // },
  // {
  //   id: 'quickstart-agent-template' as const,
  //   name: 'Quickstart',
  //   description: 'Quickstart agent',
  //   suggestedActions: [],
  // },
  // {
  //   id: 'allora-price-prediction-agent' as const,
  //   name: 'Price Prediction',
  //   description: 'Allora price prediction agent',
  //   suggestedActions: [
  //     {
  //       title: 'Get BTC',
  //       label: 'price prediction',
  //       action: 'What is the price prediction for BTC?',
  //     },
  //     {
  //       title: 'Get ETH',
  //       label: 'price prediction',
  //       action: 'What is the price prediction for ETH?',
  //     },
  //     {
  //       title: 'Compare BTC and ETH',
  //       label: 'predictions',
  //       action: 'Get price predictions for both BTC and ETH',
  //     },
  //   ],
  // },
  // {
  //   id: "ember-lp" as const,
  //   name: "LPing",
  //   description: "Camelot Liquidity Provisioning agent",
  //   suggestedActions: [
  //     {
  //       title: "Provide Liquidity",
  //       label: "on Arbitrum.",
  //       action: "Provide Liquidity on Arbitrum.",
  //     },
  //     {
  //       title: "Check",
  //       label: "Liquidity positions",
  //       action: "Check Positions",
  //     },
  //   ],
  // },
  // {
  //   id: "ember-pendle" as const,
  //   name: "Pendle",
  //   description: "Test agent for Pendle",
  //   suggestedActions: [
  //     {
  //       title: "Deposit WETH",
  //       label: "to my balance",
  //       action: "Deposit WETH to my balance",
  //     },
  //     {
  //       title: "Check",
  //       label: "balance",
  //       action: "Check balance",
  //     },
  //   ],
  // },
  {
    id: 'autosynth' as const,
    name: 'AutoSynth',
    description: 'Automated job scheduling with time, event, and condition triggers',
    suggestedActions: [
      {
        title: 'Create Safe wallet',
        label: 'on Arbitrum Sepolia',
        action: 'Create a Safe wallet on Arbitrum Sepolia (421614) with one owner',
      },
      {
        title: 'Create time-based job',
        label: 'daily at 9 AM (EOA)',
        action: 'Create a time-based job (regular wallet) that runs daily at 9 AM',
      },
      {
        title: 'Create time job (Safe)',
        label: 'interval every 60s',
        action:
          'Create a time-based job with Safe wallet mode',
      },
      {
        title: 'List my jobs',
        label: 'and their status',
        action: 'Show me all my automated jobs and their current status',
      },
      {
        title: 'Set up event trigger',
        label: 'for contract events',
        action: 'Create an event-based job that triggers when a Transfer event occurs',
      },
      {
        title: 'Help with job creation',
        label: 'general requirements',
        action: 'What are the required fields to create time, event, and condition jobs (EOA vs Safe)?',
      },
      {
        title: 'Help with scheduling',
        label: 'patterns',
        action: 'How do I create a cron job that runs every Monday at 9 AM?',
      },
    ],
  },
  {
    id: 'all' as const,
    name: 'All agents',
    description: 'All agents',
    suggestedActions: [
      {
        title: 'What Agents',
        label: 'are available?',
        action: 'What Agents are available?',
      },
      {
        title: 'What can Ember AI',
        label: 'help me with?',
        action: 'What can Ember AI help me with?',
      },
    ],
  },
] as const;

export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([
  // ['ember-aave', 'http://lending-agent-no-wallet:3001/sse'],
  // ['ember-camelot', 'http://swapping-agent-no-wallet:3005/sse'],
  // ['defisafety-agent', 'http://defisafety-agent:3010/sse'],
  // ['coingecko', 'http://coingecko-mcp-server:3011/mcp'], // CoinGecko MCP server
  ['autosynth', 'http://autosynth:3041/sse']
  // ['langgraph-workflow', 'http://langgraph-workflow-agent:3009/sse'],
  // ['quickstart-agent-template', 'http://quickstart-agent-template:3007/sse'],
  // ['allora-price-prediction-agent', 'http://allora-price-prediction-agent:3008/sse'],
  // ["ember-lp", "http://liquidity-agent-no-wallet:3002/sse"],
  // ["ember-pendle", "http://pendle-agent:3003/sse"],
]);

export type ChatAgentId = (typeof chatAgents)[number]['id'];
