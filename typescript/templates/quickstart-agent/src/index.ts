#!/usr/bin/env node
/**
 * Hello Quickstart Agent
 * Demonstrates ALL v2 framework features
 */

import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import { greetSkill } from './skills/greet.js';
import { getTimeSkill } from './skills/getTime.js';
import { echoSkill } from './skills/echo.js';
import { contextProvider } from './context/provider.js';

// Provider selector initialization
const providers = createProviderSelector({
  openRouterApiKey: process.env['OPENROUTER_API_KEY'],
  openaiApiKey: process.env['OPENAI_API_KEY'],
  xaiApiKey: process.env['XAI_API_KEY'],
  hyperbolicApiKey: process.env['HYPERBOLIC_API_KEY'],
});

const available = getAvailableProviders(providers);
if (available.length === 0) {
  console.error('No AI providers configured. Please set at least one provider API key.');
  process.exit(1);
}

const preferred = process.env['AI_PROVIDER'] || available[0]!;
const selectedProvider = providers[preferred as keyof typeof providers];
if (!selectedProvider) {
  console.error(`Preferred provider '${preferred}' not available. Available: ${available.join(', ')}`);
  process.exit(1);
}

const modelOverride = process.env['AI_MODEL'];

// Export agent configuration for testing
export const agentConfig: AgentConfig = {
  name: process.env['AGENT_NAME'] || 'Hello Quickstart Agent',
  version: process.env['AGENT_VERSION'] || '1.0.0',
  description: process.env['AGENT_DESCRIPTION'] || 'A comprehensive example demonstrating all v2 framework features',
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
  // Runtime options
  cors: process.env['ENABLE_CORS'] !== 'false',
  basePath: process.env['BASE_PATH'] || undefined,
  llm: {
    model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
  },
});

// Start the agent
const PORT = parseInt(process.env['PORT'] || '3007', 10);

agent
  .start(PORT, contextProvider)
  .then(() => {
    console.log(`🚀 Hello Quickstart Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n✨ Testing all Vibekit features:');
    console.log('  - LLM orchestration (greet skill)');
    console.log('  - Manual handlers (getTime, echo skills)');
    console.log('  - Context-aware tools');
    console.log('  - Multiple MCP servers');
    console.log('  - Hook system (withHooks)');
    console.log('  - Error handling & artifacts');
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
