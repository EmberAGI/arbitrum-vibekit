/**
 * Trading Analysis Skill - Analyzes market predictions and conditions
 * Provides actionable trading recommendations based on AI predictions
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { analyzeTradingOpportunityTool } from '../tools/analyzeTradingOpportunity.js';
import { predictAndTradeWorkflowTool } from '../tools/predictAndTradeWorkflow.js';

// Input schema for the trading analysis skill
const TradingAnalysisInputSchema = z.object({
  message: z.string().describe('Trading analysis request'),
});

export const tradingAnalysisSkill = defineSkill({
  // Skill metadata
  id: 'trading-analysis',
  name: 'Trading Analysis',
  description: 'Analyze market predictions to provide trading recommendations (BUY/SELL/HOLD) with risk assessment',

  // Required tags and examples
  tags: ['analysis', 'trading', 'decision-making', 'strategy', 'risk', 'recommendations'],
  examples: [
    'Based on the ETH prediction, what should I do?',
    'Analyze if I should trade ETH based on the forecast',
    'Should I buy BTC based on the current predictions?',
    'Give me a trading recommendation for ETH',
    'What do you recommend based on the BTC forecast?',
    'Trade ETH accordingly based on the prediction',
  ],

  // Schemas
  inputSchema: TradingAnalysisInputSchema,

  // Tools for analysis and workflow
  tools: [analyzeTradingOpportunityTool, predictAndTradeWorkflowTool],

  // MCP servers needed for workflow tool
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
        EMBER_ENDPOINT: process.env.EMBER_ENDPOINT || 'grpc.api.emberai.xyz:50051',
        PORT: process.env.EMBER_MCP_PORT || '3010',
      },
    },
  ],
});
