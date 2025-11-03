/**
 * Price Prediction Skill - Uses Allora MCP for price predictions
 * Provides access to prediction markets data and ML inferences
 */

import { z } from 'zod';
import { defineSkill } from '@emberai/arbitrum-vibekit-core';
import { getPricePredictionTool } from '../tools/getPricePrediction.js';

// Input schema for the price prediction skill - only accepts user message
const PricePredictionInputSchema = z.object({
  message: z.string().describe('User request message for price prediction'),
});

export const pricePredictionSkill = defineSkill({
  // Skill metadata
  id: 'predict-price',
  name: 'Predict Price',
  description: 'Get price predictions for a given token from Allora prediction markets',

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
  mcpServers: {
    allora: {
      command: 'node', // Using node since the package is built
      moduleName: '@alloralabs/mcp-server', // Will be resolved from workspace
      env: {
        ALLORA_API_KEY: process.env.ALLORA_API_KEY || '',
        // Use a different port for the STDIO-spawned Allora MCP server to avoid conflicts
        PORT: process.env.ALLORA_MCP_PORT || '3009', // Different from Docker Compose's 3001
      },
    },
  },

  // No handler - will use LLM orchestration
});
