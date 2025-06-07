#!/usr/bin/env node
/**
 * Hello Quickstart Agent
 * Demonstrates ALL v2 framework features with Allora integration
 */

import 'dotenv/config';
import { Agent, type AgentConfig } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { predictionSkill } from './skills/prediction.js';
import { getTimeSkill } from './skills/getTime.js';
import { echoSkill } from './skills/echo.js';
import { contextProvider } from './context/provider.js';
import type { HelloContext } from './context/types.js';

// Create OpenRouter instance for LLM
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Export agent configuration for testing
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Hello Quickstart Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description: process.env.AGENT_DESCRIPTION || 'A comprehensive example demonstrating all v2 framework features with Allora predictions',
  skills: [predictionSkill, getTimeSkill, echoSkill],
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
    model: openrouter(process.env.LLM_MODEL || 'google/gemini-2.5-flash-preview'),
  },
});

// Start the agent
const PORT = parseInt(process.env.PORT || '3007', 10);

agent
  .start(PORT, contextProvider)
  .then(() => {
    console.log(`🚀 Hello Quickstart Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n✨ Testing all Vibekit features:');
    console.log('  - LLM orchestration (prediction skill with Allora)');
    console.log('  - Manual handlers (getTime, echo skills)');
    console.log('  - Context-aware tools');
    console.log('  - Real MCP server integration (Allora)');
    console.log('  - Hook system (withHooks)');
    console.log('  - Error handling & artifacts');
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
