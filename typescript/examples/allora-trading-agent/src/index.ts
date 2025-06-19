#!/usr/bin/env node
/**
 * Allora Trading Agent
 * Combines Allora's price predictions with Ember's trading capabilities
 */

import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector } from 'arbitrum-vibekit-core';
import { marketForecastSkill } from './skills/marketForecast.js';
import { tradingAnalysisSkill } from './skills/tradingAnalysis.js';
import { tradeExecutionSkill } from './skills/tradeExecution.js';

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
  name: process.env.AGENT_NAME || 'Allora Trading Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION ||
    "An AI-powered trading agent that combines Allora's market predictions with Ember's DeFi trading capabilities",
  skills: [marketForecastSkill, tradingAnalysisSkill, tradeExecutionSkill],
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
    model: providers.openrouter(process.env.LLM_MODEL || 'google/gemini-2.5-flash-preview'),
    baseSystemPrompt: `You are an AI trading assistant that helps users make informed trading decisions. 
When asked to "trade accordingly" or for trading recommendations based on predictions, you should:
1. First get the price prediction using the Market Forecast skill
2. Then analyze the trading opportunity using the Trading Analysis skill
3. Provide a clear recommendation (BUY, SELL, or HOLD) with reasoning
4. If the user wants to execute, use the Trade Execution skill

You provide analysis and recommendations, but always remind users that the final decision is theirs. 
Be helpful and proactive in providing complete analysis when asked.`,
  },
});

// Start the agent
const PORT = parseInt(process.env.PORT || '3008', 10);

agent
  .start(PORT)
  .then(() => {
    console.log(`🚀 Allora Trading Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n✨ Features:');
    console.log('  - AI-powered price predictions from Allora markets');
    console.log('  - Trading analysis with risk assessment');
    console.log('  - Token swaps across 200+ DeFi protocols via Ember');
    console.log('  - Multi-chain support (Arbitrum, Ethereum, Base, Optimism, Polygon)');
    console.log('\n📊 Available Skills:');
    console.log('  - marketForecast: Get AI price predictions for cryptocurrencies');
    console.log('  - tradingAnalysis: Analyze opportunities and get trading recommendations');
    console.log('  - tradeExecution: Execute token swaps across DeFi protocols');
    console.log('\n🔧 MCP Servers:');
    console.log('  - Allora MCP Server (Port: ' + (process.env.ALLORA_MCP_PORT || '3009') + ')');
    console.log('  - Ember MCP Server (Port: ' + (process.env.EMBER_MCP_PORT || '3010') + ')');
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
