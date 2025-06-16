#!/usr/bin/env node
/**
 * Allora Trading Agent
 * An AI agent that performs trades based on price predictions from the Allora network.
 */

import 'dotenv/config';
import { Agent, type AgentConfig, defineSkill, createProviderSelector } from 'arbitrum-vibekit-core';
import { getPredictionTool } from './tools/getPrediction.js';
import { executeTradeTool } from './tools/executeTrade.js';
import { z } from 'zod';

// Create provider selector for LLM
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

if (!providers.openrouter) {
  throw new Error('OpenRouter provider is not available. Please check your OPENROUTER_API_KEY.');
}

// Define the skill, including the tools the LLM can orchestrate.
export const tradingSkill = defineSkill({
  id: 'allora-trading-skill',
  name: 'Allora AI Trader',
  description:
    'A skill that can get price predictions and execute trades. It can answer questions about predictions or perform trades based on them.',
  tags: ['trading', 'defi', 'allora', 'orchestration'],
  examples: [
    'What is the price prediction for ETH?',
    'Get the latest BTC forecast and trade 100 USDC for it if the prediction is good.',
    'Should I buy ARB right now?',
  ],
  inputSchema: z.object({}),
  tools: [getPredictionTool, executeTradeTool],
  mcpServers: [
    {
      command: 'node',
      moduleName: 'ember-mcp-tool-server',
      env: { EMBER_ENDPOINT: process.env.EMBER_ENDPOINT ?? 'grpc.api.emberai.xyz:50051' },
    },
    {
      command: 'node',
      moduleName: '@alloralabs/mcp-server',
      env: { ALLORA_API_KEY: process.env.ALLORA_API_KEY },
    },
  ],
});

// Define the main agent configuration
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Allora Trading Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION ||
    'An AI agent that performs trades based on price predictions from the Allora network.',
  skills: [tradingSkill],
  url: 'localhost',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};

// Create the agent instance
const agent = Agent.create(agentConfig, {
  cors: process.env.ENABLE_CORS !== 'false',
  basePath: process.env.BASE_PATH || undefined,
  llm: {
    model: providers.openrouter(process.env.LLM_MODEL || 'google/gemini-2.5-flash-preview'),
  },
});

// Start the agent server
const PORT = parseInt(process.env.PORT || '3009', 10);
agent
  .start(PORT)
  .then(() => {
    console.log(`🚀 Allora Trading Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n✨ Features:');
    console.log('  - Automated trading based on Allora predictions');
    console.log('  - Integration with Ember AI for trade execution');
    console.log('\n📊 Available Skills:');
    console.log('  - allora-trading-skill: Execute trades based on predictions');
  })
  .catch((error) => {
    console.error('Failed to start agent:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  await agent.stop();
  process.exit(0);
});
