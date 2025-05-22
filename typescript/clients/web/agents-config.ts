export const chatAgents = [
  {
    id: "ember-aave" as const,
    name: "Lending",
    description: "AAVE lending agent",
    suggestedActions: [
      {
        title: "Deposit WETH",
        label: "to my balance",
        action: "Deposit WETH to my balance",
      },
      { title: "Check", label: "balance", action: "Check balance" },
    ],
  },
  {
    id: "ember-camelot" as const,
    name: "Trading",
    description: "Camelot Swapping agent",
    suggestedActions: [
      {
        title: "Swap USDC for ETH",
        label: "on Arbitrum Network.",
        action: "Swap USDC for ETH tokens from Arbitrum to Arbitrum Network.",
      },
      {
        title: "Buy ARB",
        label: "on Arbitrum Network.",
        action: "Buy ARB token.",
      },
    ],
  },
  {
    id: "ember-lp" as const,
    name: "LPing",
    description: "Camelot Liquidity Provisioning agent",
    suggestedActions: [
      {
        title: "Provide Liquidity",
        label: "on Arbitrum Network.",
        action: "Provide Liquidity on Arbitrum Network.",
      },
      {
        title: "Check",
        label: "Liquidity positions",
        action: "Check Positions",
      },
    ],
  },
  {
    id: "ember-pendle" as const,
    name: "Pendle",
    description: "Test agent for Pendle",
    suggestedActions: [
      {
        title: "Deposit WETH",
        label: "to my balance",
        action: "Deposit WETH to my balance",
      },
      {
        title: "Check",
        label: "balance",
        action: "Check balance",
      },
    ],
  },
  {
    id: "all" as const,
    name: "All agents",
    description: "All agents",
    suggestedActions: [
      {
        title: "What Agents",
        label: "are available?",
        action: "What Agents are available?",
      },
      {
        title: "What can Ember AI",
        label: "help me with?",
        action: "What can Ember AI help me with?",
      },
    ],
  },
] as const;

export const DEFAULT_SERVER_URLS = new Map<ChatAgentId, string>([
  ["ember-aave", "http://173.230.139.151:3010/sse"],
  ["ember-camelot", "http://173.230.139.151:3011/sse"],
  ["ember-lp", "http://173.230.139.151:3012/sse"],
  ["ember-pendle", "http://173.230.139.151:3013/sse"],
]);

export type ChatAgentId = (typeof chatAgents)[number]["id"];
