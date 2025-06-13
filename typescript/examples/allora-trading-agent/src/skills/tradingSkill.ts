/**
 * Trading Skill
 * This skill orchestrates fetching price predictions and executing trades.
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { getPricePredictionTool } from '../tools/getPricePrediction.js';
import { getCurrentPriceTool } from '../tools/getCurrentPrice.js';
import { buyTokenTool, sellTokenTool } from '../tools/tradingTools.js';
import { makeTradeDecisionTool } from '../tools/makeTradeDecisionTool.js';
import { parseTokenFromMessageHook } from '../hooks/parseTokenFromMessageHook.js';
import type { AgentContext, Task, Message } from 'arbitrum-vibekit-core';

const TradingInputSchema = z.object({
  message: z
    .string()
    .describe('User request for trading or price prediction (e.g., "What is the BTC price prediction? Should I buy?")'),
});

export const tradingSkill = defineSkill({
  id: 'analyze-and-trade',
  name: 'Analyze and Trade Crypto',
  description:
    'I analyze cryptocurrency prices to make trading decisions. When asked about a token, I will: 1) Get the price prediction, 2) Get the current price, 3) Compare them to decide whether to buy, sell, or hold.',

  // Tags and examples are required by the framework for skill discovery and metadata.
  tags: ['trading', 'analysis', 'crypto', 'allora', 'ember'],
  examples: [
    'What is the price prediction for BTC and should I buy some?',
    "Give me today's ETH forecast and trade accordingly.",
  ],

  inputSchema: TradingInputSchema,

  tools: [getPricePredictionTool, getCurrentPriceTool, makeTradeDecisionTool, buyTokenTool, sellTokenTool],

  mcpServers: [
    {
      command: 'node',
      moduleName: '@alloralabs/mcp-server',
      env: {
        ALLORA_API_KEY: process.env.ALLORA_API_KEY || '',
        PORT: process.env.ALLORA_MCP_PORT || '3009',
      },
    },
    {
      command: 'node',
      moduleName: 'ember-mcp-tool-server',
      env: {
        EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'grpc.api.emberai.xyz:50051',
      },
    },
  ],
});
