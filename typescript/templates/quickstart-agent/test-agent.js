#!/usr/bin/env node
/**
 * Simple test agent without context provider
 */

import 'dotenv/config';
import { Agent, createProviderSelector, getAvailableProviders } from 'arbitrum-vibekit-core';
import { greetSkill } from './src/skills/greet.js';
import { getTimeSkill } from './src/skills/getTime.js';
import { echoSkill } from './src/skills/echo.js';

// Provider selector initialization
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

const available = getAvailableProviders(providers);
if (available.length === 0) {
  console.error('No AI providers configured. Please set at least one provider API key.');
  process.exit(1);
}

const preferred = process.env.AI_PROVIDER || available[0];
const selectedProvider = providers[preferred];
if (!selectedProvider) {
  console.error(`Preferred provider '${preferred}' not available. Available: ${available.join(', ')}`);
  process.exit(1);
}

console.log(`Using provider: ${preferred}`);

// Export agent configuration for testing
const agentConfig = {
  name: 'Test Agent',
  version: '1.0.0',
  description: 'Simple test agent',
  skills: [greetSkill, getTimeSkill, echoSkill],
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
  cors: true,
  llm: {
    model: selectedProvider(),
  },
});

// Start the agent
const PORT = 3007;

console.log('Starting agent...');
agent
  .start(PORT)
  .then(() => {
    console.log(`🚀 Test Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
  })
  .catch((error) => {
    console.error('Failed to start agent:', error);
    process.exit(1);
  });

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  await agent.stop();
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => shutdown(sig));
});
