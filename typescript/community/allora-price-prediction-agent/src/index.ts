#!/usr/bin/env node
/**
 * Allora Price Prediction Agent
 * Provides price predictions using Allora's prediction markets data
 */

import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import { pricePredictionSkill } from './skills/pricePrediction.js';

// Initialize provider selector with all supported API keys
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

// Determine available providers
const availableProviders = getAvailableProviders(providers);

if (availableProviders.length === 0) {
  throw new Error(
    'No AI providers configured. Please set at least one provider API key (OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY, or HYPERBOLIC_API_KEY).',
  );
}

// Allow user to choose provider via env, else fall back to first available
const preferredProvider = process.env.AI_PROVIDER || availableProviders[0]!;
const selectedProvider = providers[preferredProvider as keyof typeof providers];

if (!selectedProvider) {
  throw new Error(
    `Preferred provider '${preferredProvider}' is not available. Available providers: ${availableProviders.join(', ')}`,
  );
}

// Optional model override via AI_MODEL env variable
const modelOverride = process.env.AI_MODEL;

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
    model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
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
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  await agent.stop();
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => shutdown(sig));
});
