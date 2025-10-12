import { z } from 'zod';
import { defineSkill } from '@emberai/arbitrum-vibekit-core';
import { swapTokensTool } from '../tools/swapTokens.js';

// Input schema for the swapping skill
export const swappingSkillInputSchema = z.object({
  instruction: z.string().describe('Natural language instruction for token swapping operations'),
  userAddress: z.string().describe('User wallet address for the swapping operation').optional(),
});

/**
 * Token Swapping Skill
 *
 * Provides comprehensive token swapping capabilities through DEX integration.
 * Supports cross-chain swaps, token resolution, and balance validation.
 */
export const swappingSkill = defineSkill({
  id: 'token-swapping',
  name: 'Token Swapping',
  description:
    'Execute token swaps on decentralized exchanges with intelligent routing and validation',
  tags: ['defi', 'trading', 'dex', 'camelot', 'swapping'],
  examples: [
    'Swap 100 USDC for ETH',
    'Exchange 0.5 ETH to DAI on Arbitrum',
    'Convert 1000 USDT to WBTC',
    'Swap 50 ARB for USDC',
    'Trade 2 ETH for maximum LINK tokens',
  ],
  inputSchema: swappingSkillInputSchema,
  mcpServers: {
    'ember-onchain': {
      url: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
      // No authorization needed according to user
      alwaysAllow: ['getCapabilities', 'getTokens', 'swapTokens'],
      disabled: false,
    },
  },
  tools: [swapTokensTool],
  // No manual handler - use LLM orchestration for flexible routing
});

export type SwappingSkillInput = z.infer<typeof swappingSkillInputSchema>;
