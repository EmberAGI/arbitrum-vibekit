#!/usr/bin/env node
import 'dotenv/config';
import { Agent, createProviderSelector, getAvailableProviders } from 'arbitrum-vibekit-core';
import { agentConfig } from './agent.js';

// Provider selector setup (same pattern as other agents)
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

const available = getAvailableProviders(providers);
if (available.length === 0) {
  console.error('No AI providers configured. Set at least one provider API key.');
  process.exit(1);
}

const preferred = process.env.AI_PROVIDER || available[0]!;
const selectedProvider = providers[preferred as keyof typeof providers];
if (!selectedProvider) {
  console.error(`Preferred provider '${preferred}' not available.`);
  process.exit(1);
}

const modelOverride = process.env.AI_MODEL;

// Only run the main execution if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = Agent.create(agentConfig, {
    cors: true,
    basePath: '/',
    llm: {
      model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
    },
  });

  const PORT = parseInt(process.env.PORT || '3008', 10);

  agent
    .start(PORT)
    .then(() => {
      console.log(`🚀 Perpetuals Agent running on port ${PORT}`);
      console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
      console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    })
    .catch(err => {
      console.error('Failed to start Perpetuals Agent:', err);
      process.exit(1);
    });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    await agent.stop();
    process.exit(0);
  };

  ['SIGINT', 'SIGTERM'].forEach(sig => {
    process.on(sig, () => shutdown(sig));
  });
}

export function createPerpetualsAgent() {
  return Agent.create(agentConfig, {
    cors: true,
    basePath: '/',
    llm: {
      model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(),
    },
  });
} 