export const chatAgents = [
  {
    id: "predict-agent" as const,
    name: "Predict Agent",
    description:
      "An agent that uses Allora predictions to inform token swaps, based on swapping-agent-no-wallet.",
    suggestedActions: [
      {
        title: "Predict and swap",
        label: "WETH",
        action: "Predict and swap WETH",
      },
      { title: "Show", label: "predictions", action: "Show predictions" },
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
  ["predict-agent", "http://predict-agent:3001/sse"],
]);

export type ChatAgentId = (typeof chatAgents)[number]["id"];
