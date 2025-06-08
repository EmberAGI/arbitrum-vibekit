/**
 * Price Prediction Skill - Uses Allora MCP for price predictions
 * Provides access to prediction markets data and ML inferences
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { getPricePredictionTool } from '../tools/getPricePrediction.js';

// Input schema for the price prediction skill
const PricePredictionInputSchema = z.object({
  token: z.string().describe('Token symbol to get price prediction for (e.g., "BTC", "ETH")'),
  timeframe: z.string().optional().describe('Optional timeframe for prediction (e.g., "8 hours", "24 hours")'),
});

export const pricePredictionSkill = defineSkill({
  // Skill metadata
  id: 'price-prediction',
  name: 'pricePrediction',
  description: 'Get price predictions and market data from Allora prediction markets',

  // Required tags and examples
  tags: ['prediction', 'price', 'market-data', 'allora'],
  examples: [
    'What is the BTC price prediction?',
    'Get ETH price prediction for the next 8 hours',
    'Show me the price prediction for Bitcoin',
    'What will be the price of Ethereum?',
  ],

  // Schemas
  inputSchema: PricePredictionInputSchema,

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
