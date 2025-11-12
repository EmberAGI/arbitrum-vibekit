#!/usr/bin/env node
import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector, getAvailableProviders } from '@emberai/arbitrum-vibekit-core';
import { defiSafetyEvaluationSkill } from './skills/defiSafetyEvaluation.js';

// Create provider selector with available API keys
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

// Check for available providers
const availableProviders = getAvailableProviders(providers);
if (availableProviders.length === 0) {
  console.error('No AI providers configured. Please set at least one provider API key.');
  console.error('Supported: OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY, HYPERBOLIC_API_KEY');
  process.exit(1);
}

// Use AI_PROVIDER env var or fallback to first available
const preferredProvider = process.env.AI_PROVIDER || availableProviders[0]!;
const selectedProvider = providers[preferredProvider as keyof typeof providers];
if (!selectedProvider) {
  console.error(`Preferred provider '${preferredProvider}' not available.`);
  console.error(`Available providers: ${availableProviders.join(', ')}`);
  process.exit(1);
}

// Get model override if specified
const modelOverride = process.env.AI_MODEL || process.env.LLM_MODEL;

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
    model: modelOverride 
      ? selectedProvider(modelOverride) 
      : selectedProvider('google/gemini-flash-2.5'), // Default to Gemini Flash for fast responses
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
    console.log(`\n🧠 AI Provider: ${preferredProvider} (${modelOverride || 'google/gemini-flash-1.5'})`);
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