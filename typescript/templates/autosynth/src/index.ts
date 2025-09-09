#!/usr/bin/env node
/**
 * TriggerX Agent
 * Automated job scheduling with time, event, and condition triggers
 */

import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector, getAvailableProviders } from 'arbitrum-vibekit-core';
import { jobManagementSkill } from './skills/jobManagement.js';
import { jobListingSkill } from './skills/jobListingSkill.js';
import { scheduleAssistantSkill } from './skills/scheduleAssistant.js';
import { contextProvider } from './context/provider.js';
import type { TriggerXContext } from './context/types.js';

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

const preferred = process.env.AI_PROVIDER || available[0]!;
const selectedProvider = providers[preferred as keyof typeof providers];
if (!selectedProvider) {
  console.error(`Preferred provider '${preferred}' not available. Available: ${available.join(', ')}`);
  process.exit(1);
}

const modelOverride = process.env.AI_MODEL;

// Export agent configuration for testing
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'AutoSynth',
  version: process.env.AGENT_VERSION || '1.0.0',
  description: process.env.AGENT_DESCRIPTION || 'Automated job scheduling with time, event, and condition triggers',
  skills: [jobListingSkill, jobManagementSkill, scheduleAssistantSkill],
  url: process.env.AGENT_URL || 'localhost',
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
const PORT = parseInt(process.env.PORT || '3041', 10);

agent
  .start(PORT, contextProvider)
  .then(() => {
    const host = process.env.HOST || '0.0.0.0';
    const agentUrl = process.env.AGENT_URL || `http://${host === '0.0.0.0' ? 'localhost' : host}:${PORT}`;
    console.log(`🚀 AutoSynth Agent running on ${host}:${PORT}`);
    console.log(`📍 Base URL: ${agentUrl}`);
    console.log(`🤖 Agent Card: ${agentUrl}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: ${agentUrl}/sse`);
    console.log('\n⚡ TriggerX Features:');
    console.log('  - Time-based job scheduling (interval, cron, specific)');
    console.log('  - Event-triggered automation');
    console.log('  - Condition-based execution');
    console.log('  - Multi-chain support');
    console.log('  - Dynamic argument fetching');
    console.log('  - Job management and monitoring');
  })
  .catch((error) => {
    console.error('Failed to start AutoSynth agent:', error);
    process.exit(1);
  });

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Shutting down AutoSynth agent...`);
  await agent.stop();
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => shutdown(sig));
});
