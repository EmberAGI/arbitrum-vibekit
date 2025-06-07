/**
 * Prediction Skill - Demonstrates LLM orchestration with Allora MCP
 * Uses Allora prediction market data to provide insights and forecasts
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { listAlloraTopicsTool, getAlloraInferenceTool, analyzePredictionTool } from '../tools/alloraTools.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input schema for the prediction skill
const PredictionInputSchema = z.object({
  action: z.enum(['list', 'get', 'analyze']).describe('What to do with predictions'),
  topicID: z.number().optional().describe('Specific topic ID for predictions'),
  query: z.string().optional().describe('Natural language query about predictions'),
});

// Output schema for prediction data
const PredictionOutputSchema = z.object({
  result: z.string().describe('The prediction result or analysis'),
  topics: z.array(z.any()).optional().describe('Available prediction topics'),
  inference: z.any().optional().describe('Specific inference data'),
  confidence: z.number().optional().describe('Confidence level of the prediction'),
  timestamp: z.string().describe('When the prediction was fetched'),
});

export const predictionSkill = defineSkill({
  // Skill metadata
  id: 'prediction-skill',
  name: 'prediction',
  description: 'Access Allora network predictions and market insights',

  // Required tags and examples
  tags: ['predictions', 'forecasting', 'market-data', 'allora'],
  examples: [
    'Show me all available prediction topics',
    'Get the latest prediction for topic 1',
    'What is the ETH price prediction?',
    'Analyze the confidence levels for BTC predictions'
  ],

  // Schemas
  inputSchema: PredictionInputSchema,

  // Tools available to this skill
  tools: [listAlloraTopicsTool, getAlloraInferenceTool, analyzePredictionTool],

  // MCP servers this skill needs - Allora MCP
  mcpServers: [
    {
      // Allora MCP server for prediction market data
      command: 'node',
      moduleName: path.join(__dirname, '../../../../lib/mcp-tools/allora-mcp-server/dist/index.js'),
      env: {
        ...process.env,
        ALLORA_API_KEY: process.env.ALLORA_API_KEY || 'UP-86455f53320d4ee48a958cc0',
      },
    },
  ],

  // No handler - will use LLM orchestration
  // The LLM will intelligently use the tools based on the user's request
});
