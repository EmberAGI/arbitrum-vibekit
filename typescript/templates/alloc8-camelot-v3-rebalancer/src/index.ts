#!/usr/bin/env node
/**
 * Camelot v3 LP Rebalancing Agent
 * Automated LP rebalancing agent for Camelot v3 concentrated liquidity pools
 */

import 'dotenv/config';
import { Agent, createProviderSelector, getAvailableProviders } from 'arbitrum-vibekit-core';
import { contextProvider } from './context/provider.js';
import { agentConfig } from './config/index.js';

// Provider selector initialization
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});

const available = getAvailableProviders(providers);
if (available.length === 0) {
  console.error('❌ No AI providers configured. Please set at least one provider API key.');
  console.error(
    '   Supported providers: OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY'
  );
  process.exit(1);
}

const preferred = process.env.AI_PROVIDER || available[0]!;
const selectedProvider = providers[preferred as keyof typeof providers];
if (!selectedProvider) {
  console.error(
    `❌ Preferred provider '${preferred}' not available. Available: ${available.join(', ')}`
  );
  process.exit(1);
}

const modelOverride = process.env.AI_MODEL;

// Export agent configuration for testing
export { agentConfig };

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
const PORT = parseInt(process.env.PORT || '3002', 10);

// Health check endpoint for production deployments
export { agent };

async function startAgent() {
  try {
    await agent.start(PORT, async deps => {
      // Pass the LLM model to the context provider
      const llmModel = modelOverride ? selectedProvider!(modelOverride) : selectedProvider!();
      return contextProvider({ ...deps, llmModel });
    });

    console.log('🔥 Camelot v3 LP Rebalancing Agent successfully started!');
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log(`💬 MCP Messages: http://localhost:${PORT}/messages`);
    console.log('\n🎯 Available Skills:');

    agentConfig.skills.forEach(skill => {
      console.log(`   - ${skill.name}: ${skill.description}`);
    });

    console.log('\n💡 Environment Configuration:');
    console.log(`   - AI Provider: ${preferred}`);
    console.log(`   - Model: ${modelOverride || 'default'}`);
    console.log(`   - CORS Enabled: ${process.env.ENABLE_CORS !== 'false'}`);
    console.log(
      `   - Arbitrum RPC: ${process.env.ARBITRUM_RPC_URL ? '✅ configured' : '⚠️  using default'}`
    );
    console.log(
      `   - Ember MCP Server: ${process.env.EMBER_MCP_SERVER_URL ? '✅ configured' : '⚠️  using default'}`
    );
    console.log(
      `   - Telegram Bot: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ configured' : '⚠️  not configured'}`
    );

    // Load and display agent configuration
    try {
      const { loadAgentConfig } = await import('./config/index.js');
      const config = loadAgentConfig();

      console.log('\n⚙️  Rebalancing Configuration:');
      console.log(`   - Mode: ${config.mode}`);
      console.log(`   - Discovery Mode: ${config.discoveryMode}`);
      console.log(`   - Risk Profile: ${config.riskProfile}`);
      console.log(`   - Check Interval: ${config.checkInterval / 1000}s`);

      if (config.discoveryMode === 'single-pool') {
        if (config.poolId && config.token0 && config.token1) {
          console.log(`   - Target Pool: ${config.token0}/${config.token1} (${config.poolId})`);
        } else {
          console.log('   - Target Pool: Not configured (set POOL_ID, TOKEN_0, TOKEN_1)');
        }
      } else {
        console.log(`   - Auto-Discovery: Enabled on chains [${config.chainIds.join(', ')}]`);
        console.log('   - Will monitor all active LP positions for configured wallet');
      }

      console.log('\n🚀 Ready to start monitoring! Use the monitoring skill to begin.');
    } catch (configError) {
      console.log('\n⚠️  Configuration incomplete. Please check your .env file:');
      console.log('   - DISCOVERY_MODE: auto-discover or single-pool');
      console.log('   - CHAIN_IDS: Comma-separated chain IDs (for auto-discovery)');
      console.log('   - POOL_ID: Camelot v3 pool address (for single-pool mode)');
      console.log('   - TOKEN_0: First token symbol (for single-pool mode)');
      console.log('   - TOKEN_1: Second token symbol (for single-pool mode)');
      console.log('   - WALLET_PRIVATE_KEY: Wallet private key');
      console.log('   - TELEGRAM_BOT_TOKEN: (optional) Telegram bot token');
      console.log('   - TELEGRAM_CHAT_ID: (optional) Telegram chat ID');
    }
  } catch (error) {
    console.error('❌ Failed to start Camelot v3 LP Rebalancing Agent:', error);
    process.exit(1);
  }
}

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  console.log(
    `\n🛑 Received ${signal}. Shutting down Camelot v3 LP Rebalancing Agent gracefully...`
  );
  try {
    await agent.stop();
    console.log('✅ Agent stopped successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach(signal => {
  process.on(signal, () => shutdown(signal));
});

// Handle uncaught exceptions and rejections
process.on('uncaughtException', error => {
  console.error('❌ Uncaught Exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// Start the agent if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startAgent();
}
