import { z } from 'zod';
import { defineSkill, type AgentConfig } from 'arbitrum-vibekit-core';
import { perpetualsTools } from './tools/index.js';

// No custom context for now
export type PerpetualsAgentContext = Record<string, never>;

const inputSchema = z.object({
  instruction: z
    .string()
    .describe('A free-form perpetuals trading or information request'),
  walletAddress: z
    .string()
    .describe('User wallet address used for signing transactions'),
});

export const agentConfig: AgentConfig = {
  name: 'Perpetuals Agent',
  version: '1.0.0',
  description: 'GMX perpetuals trading agent that proxies the onchain-actions MCP API',
  skills: [
    defineSkill({
      id: 'ask-perpetuals-agent',
      name: 'Ask Perpetuals Agent',
      description:
        'Execute GMX perpetuals trades or queries such as opening/closing positions, cancelling orders, or fetching markets/positions.',
      tags: ['perpetuals', 'trading', 'gmx'],
      examples: [
        'Open a 2x long on ETH/USD perp',
        'Show my current perp positions',
        'Close my BTC short position',
      ],
      inputSchema,
      tools: perpetualsTools as unknown as any[], // type inference workaround
      mcpServers: {
        onchain: {
          url: process.env.EMBER_ENDPOINT || 'http://localhost:3001/mcp',
        },
      },
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