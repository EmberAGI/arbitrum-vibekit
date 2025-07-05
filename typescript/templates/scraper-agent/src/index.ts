#!/usr/bin/env node
/**
 * Documentation RAG Agent
 * An AI agent for indexing and querying documentation using RAG
 */

import 'dotenv/config';
import { Agent, type AgentConfig } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { documentationRAGSkill } from './skills/documentationRAG.js';

// Create OpenRouter instance for LLM
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Export agent configuration for testing
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Documentation RAG Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION || 'AI agent for indexing and querying documentation using RAG',
  skills: [documentationRAGSkill],
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
    model: openrouter(process.env.LLM_MODEL || 'google/gemini-2.0-flash-thinking-exp-1219') as any,
  },
});

// Start the agent
const PORT = parseInt(process.env.PORT || '3008', 10);

agent
  .start(PORT)
  .then(() => {
    console.log(`🚀 Documentation RAG Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n✨ Available skill:');
    console.log('  - Documentation RAG (index, query, and manage documentation)');
  })
  .catch(error => {
    console.error('Failed to start agent:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  await agent.stop();
  process.exit(0);
});
