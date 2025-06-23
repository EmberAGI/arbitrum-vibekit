/**
 * Market Forecast Skill - Uses Allora MCP for AI-powered price predictions
 * Provides access to prediction markets data for trading decisions
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { getPricePredictionTool } from '../tools/getPricePrediction.js';

// Input schema for the market forecast skill - only accepts user message
const MarketForecastInputSchema = z.object({
  message: z.string().describe('User request for market forecast'),
});

export const marketForecastSkill = defineSkill({
  // Skill metadata
  id: 'market-forecast',
  name: 'Market Forecast',
  description: 'Get AI-powered price predictions for cryptocurrencies using Allora prediction markets',

  // Required tags and examples
  tags: ['prediction', 'forecast', 'market-data', 'allora', 'ai', 'trading'],
  examples: [
    'What is the BTC price prediction for the next 24 hours?',
    'Get me the ETH price forecast',
    'Show price predictions for Bitcoin',
    'What will USDC be worth tomorrow?',
    'Get market forecast for Arbitrum token',
    "What's the predicted price movement for ETH?",
    'Show me the AI prediction for BTC price',
  ],

  // Schemas
  inputSchema: MarketForecastInputSchema,

  // Single tool that handles everything
  tools: [getPricePredictionTool],

  // MCP servers this skill needs
  mcpServers: [
    {
      command: 'node', // Using node since the package is built
      moduleName: '@alloralabs/mcp-server', // Will be resolved from workspace
      env: {
        ALLORA_API_KEY: process.env.ALLORA_API_KEY || '',
        // Use a different port for the STDIO-spawned Allora MCP server to avoid conflicts
        PORT: process.env.ALLORA_MCP_PORT || '3009', // Different from Docker Compose's 3001
      },
    },
  ],

  // No handler - will use LLM orchestration
});
