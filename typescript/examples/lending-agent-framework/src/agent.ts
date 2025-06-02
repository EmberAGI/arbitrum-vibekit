import { z } from 'zod';
import { defineSkill, type AgentConfig } from 'arbitrum-vibekit-core';

// Placeholder for agent context (extend as needed)
export type LendingAgentContext = {};

const inputSchema = z.object({
  instruction: z.string().describe('A natural‑language lending directive.'),
  walletAddress: z
    .string()
    .describe('The user wallet address which is used to sign transactions and to pay for gas.'),
});

export const agentConfig: AgentConfig = {
  name: 'Lending Agent',
  version: '1.0.0',
  description: 'A lending agent that can lend and borrow on Aave',
  skills: [
    defineSkill<typeof inputSchema>({
      id: 'ask-lending-agent',
      name: 'Ask Lending Agent',
      description:
        'Sends a free‑form, natural‑language lending instruction to this lending AI agent and returns a structured quote including transaction data to sign and send.',
      tags: ['lending'],
      examples: ['Borrow 50 USDC', 'Supply 10 ETH', 'What is my debt?', 'What is my balance?'],
      inputSchema,
      tools: [
        // MCP tools will be loaded dynamically at runtime and injected here
      ],
      // No handler: LLM orchestration will be used when tools are present
    }),
  ],
  url: 'localhost',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};
