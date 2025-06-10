#!/usr/bin/env node
/**
 * Allora Price Prediction Agent
 * Provides price predictions using Allora's prediction markets data
 */

import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector } from 'arbitrum-vibekit-core';
import { pricePredictionSkill } from './skills/pricePrediction.js';

// Create provider selector
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
});

// Check if OpenRouter is available
if (!providers.openrouter) {
  throw new Error('OpenRouter provider is not available. Please check your OPENROUTER_API_KEY.');
}

// Export agent configuration for testing
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Allora Price Prediction Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION || 'An AI agent that provides price predictions using Allora prediction markets data',
  skills: [pricePredictionSkill],
  url: 'localhost',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};

// Configure the agent
const agent = Agent.create(agentConfig, {
  // Runtime options
  cors: process.env.ENABLE_CORS !== 'false',
  basePath: process.env.BASE_PATH || undefined,
  llm: {
    model: providers.openrouter(process.env.LLM_MODEL || 'google/gemini-flash-1.5'),
  },
});

// Start the agent
const PORT = parseInt(process.env.PORT || '3008', 10);

agent
  .start(PORT)
  .then(() => {
    console.log(`🚀 Allora Price Prediction Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n✨ Features:');
    console.log('  - Price predictions using Allora prediction markets');
    console.log('  - LLM orchestration for natural language queries');
    console.log('  - Real-time market data access');
    console.log('\n📊 Available Skills:');
    console.log('  - pricePrediction: Get price predictions and market data');
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
