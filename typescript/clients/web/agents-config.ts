import type { ComponentRegistry } from './components/agent-components/types';
import type { AgentSidepanelRegistry } from './artifacts/agent-sidepanels/types';

export const chatAgents = [
  {
    id: 'ember-aave' as const,
    name: 'Lending',
    description: 'AAVE lending agent',
    suggestedActions: [
      {
        title: 'Deposit WETH',
        label: 'to my balance',
        action: 'Deposit WETH to my balance',
      },
      { title: 'Check', label: 'balance', action: 'Check balance' },
    ],
  },
  {
    id: 'ember-camelot' as const,
    name: 'Trading',
    description: 'Camelot Swapping agent',
    suggestedActions: [
      {
        title: 'Swap USDC for ETH',
        label: 'on Arbitrum Network.',
        action: 'Swap USDC for ETH tokens from Arbitrum to Arbitrum.',
      },
      {
        title: 'Buy ARB',
        label: 'on Arbitrum.',
        action: 'Buy ARB token.',
      },
    ],
  },
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
  ['ember-aave', 'http://lending-agent-no-wallet:3001/sse'],
  ['ember-camelot', 'http://swapping-agent-no-wallet:3005/sse'],
  // ['langgraph-workflow', 'http://langgraph-workflow-agent:3009/sse'],
  // ['quickstart-agent-template', 'http://quickstart-agent-template:3007/sse'],
  // ['allora-price-prediction-agent', 'http://allora-price-prediction-agent:3008/sse'],
  // ["ember-lp", "http://liquidity-agent-no-wallet:3002/sse"],
  // ["ember-pendle", "http://pendle-agent:3003/sse"],
]);

export type ChatAgentId = (typeof chatAgents)[number]['id'];

// Component registry - defines which component to use for each tool name pattern
export const componentRegistry: ComponentRegistry = [
  {
    toolNamePattern: /askSwapAgent$/,
    componentPath: 'Swaps',
  },
  {
    toolNamePattern: /askLendingAgent$/,
    componentPath: 'Lending',
  },
  {
    toolNamePattern: /askLiquidityAgent$/,
    componentPath: 'Liquidity',
    propsExtractor: (toolInvocationResult) => ({
      positions: toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.positions || null,
      pools: toolInvocationResult?.artifacts?.[0]?.parts[0]?.data?.pools || null,
    }),
  },
  {
    toolNamePattern: /askYieldTokenizationAgent$/,
    componentPath: 'Pendle',
    propsExtractor: (toolInvocationResult) => {
      const getParts = () => toolInvocationResult?.artifacts ? toolInvocationResult?.artifacts[0]?.parts : null;
      const getArtifact = () => toolInvocationResult?.artifacts ? toolInvocationResult?.artifacts[0] : null;
      
      return {
        markets: getParts(),
        isMarketList: getArtifact()?.name === 'yield-markets',
      };
    },
  },
  // Weather component (legacy support)
  {
    toolNamePattern: /getWeather$/,
    componentPath: 'Weather', // This would need to be moved to agent-components if desired
  },
  // Document components (legacy support)
  {
    toolNamePattern: /createDocument$/,
    componentPath: 'DocumentPreview',
  },
  {
    toolNamePattern: /updateDocument$/,
    componentPath: 'DocumentToolResult',
  },
  {
    toolNamePattern: /requestSuggestions$/,
    componentPath: 'DocumentToolResult',
  },
];

// Agent sidepanel registry - defines which sidepanel to show for each agent and trigger
export const agentSidepanelRegistry: AgentSidepanelRegistry = [
  {
    sidepanelId: 'hello-world',
    agentId: 'ember-aave', // Lending agent
    triggerMode: 'on-agent-selection',
    priority: 10,
    propsExtractor: (data) => ({
      message: `Hello from the ${data.selectedAgentId} agent!`,
      customData: {
        timestamp: new Date().toISOString(),
        agentType: 'lending',
      },
    }),
  },
  // Example configurations for other trigger modes:
  
  // Show sidepanel on tool invocation
  // {
  //   sidepanelId: 'hello-world',
  //   agentId: 'ember-camelot',
  //   triggerMode: 'on-tool-invocation',
  //   toolNamePattern: /askSwapAgent$/,
  //   priority: 5,
  //   propsExtractor: (data) => ({
  //     message: 'Swap operation completed!',
  //     swapData: data.toolInvocationResult,
  //   }),
  // },
  
  // Show sidepanel when specific property exists
  // {
  //   sidepanelId: 'hello-world',
  //   agentId: 'all',
  //   triggerMode: 'on-property-existence',
  //   triggerProperty: 'artifacts.0.parts.0.data.txPlan',
  //   priority: 1,
  //   propsExtractor: (data) => ({
  //     message: 'Transaction plan detected!',
  //     txData: data.toolInvocationResult?.artifacts?.[0]?.parts[0]?.data,
  //   }),
  // },
];
