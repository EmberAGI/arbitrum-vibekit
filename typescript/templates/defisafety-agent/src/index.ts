#!/usr/bin/env node
import 'dotenv/config';
import { Agent, type AgentConfig } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { defiSafetyEvaluationSkill } from './skills/defiSafetyEvaluation.js';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'DeFi Safety Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION || 'AI agent for evaluating DeFi protocol safety and documentation quality',
  skills: [defiSafetyEvaluationSkill],
  url: 'localhost',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};

const agent = Agent.create(agentConfig, {
  cors: process.env.ENABLE_CORS !== 'false',
  basePath: process.env.BASE_PATH || undefined,
  llm: {
    model: openrouter(process.env.LLM_MODEL || 'google/gemini-flash-1.5') as any,
  },
});

const PORT = parseInt(process.env.PORT || '3010', 10);

agent
  .start(PORT)
  .then(() => {
    console.log(`🚀 DeFi Safety Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n✨ Available skill:');
    console.log('  - DeFi Safety Evaluation (protocol assessment and scoring)');
  })
  .catch(error => {
    console.error('Failed to start agent:', error);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  await agent.stop();
  process.exit(0);
});