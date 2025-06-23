/**
 * Trade Execution Skill - Execute token swaps via Ember
 * Integrates with EmberAI MCP for cross-chain DeFi trading
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { executeTradeTool } from '../tools/executeTrade.js';

// Input schema for the trade execution skill
const TradeExecutionInputSchema = z.object({
  message: z.string().describe('Trade execution request'),
});

export const tradeExecutionSkill = defineSkill({
  // Skill metadata
  id: 'trade-execution',
  name: 'Trade Execution',
  description: 'Execute token swaps and manage trades across DeFi protocols via Ember',

  // Required tags and examples
  tags: ['trading', 'swap', 'execution', 'defi', 'ember', 'transaction', 'exchange'],
  examples: [
    'Buy 100 USDC worth of ETH',
    'Swap 0.5 ETH for USDC',
    'Execute the recommended BTC trade',
    'Convert all my DAI to USDT',
    'Trade 1000 ARB tokens for ETH with 1% slippage',
    'Buy ETH on Arbitrum with 500 USDC',
    'Swap my WBTC to USDC on Ethereum',
    'Execute a trade from ETH to DAI on Base',
  ],

  // Schemas
  inputSchema: TradeExecutionInputSchema,

  // Tools for execution
  tools: [executeTradeTool],

  // MCP servers this skill needs
  mcpServers: [
    {
      command: 'node',
      moduleName: 'ember-mcp-tool-server',
      env: {
        EMBER_ENDPOINT: process.env.EMBER_ENDPOINT || 'grpc.api.emberai.xyz:50051',
        PORT: process.env.EMBER_MCP_PORT || '3010', // Different port from Allora
      },
    },
  ],
});
