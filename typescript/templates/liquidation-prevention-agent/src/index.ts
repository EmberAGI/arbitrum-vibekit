#!/usr/bin/env node
/**
 * Liquidation Prevention Agent
 * Monitors health factors and automatically prevents liquidations using strategic interventions
 */

import 'dotenv/config';
import { Agent, type AgentConfig, createProviderSelector, getAvailableProviders } from 'arbitrum-vibekit-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { contextProvider } from './context/provider.js';
import { loadTokenMapFromMcp } from './tokenMap.js';

// Provider selector initialization
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  // openaiApiKey: process.env.OPENAI_API_KEY,
  // xaiApiKey: process.env.XAI_API_KEY,
  // hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
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

// Remove agentConfig definition and import it from config.ts instead
import { agentConfig } from './config.js';

// Configure the agent
const agent = Agent.create(agentConfig, {
  // Runtime options
  cors: process.env.ENABLE_CORS !== 'false',
  basePath: process.env.BASE_PATH || undefined,
  llm: {
    model: modelOverride ? selectedProvider!(modelOverride) : selectedProvider!(process.env.LLM_MODEL || 'deepseek/deepseek-chat-v3-0324:free'),
  },
});

// Start the agent
const PORT = parseInt(process.env.PORT || '3010', 10);

agent
  .start(PORT, async deps => {
    // Create manual MCP client for Ember endpoint
    let emberMcpClient: Client | null = null;

    const emberEndpoint = process.env.EMBER_ENDPOINT || 'http://api.emberai.xyz/mcp';

    try {
      console.log(`Connecting to MCP server at ${emberEndpoint}`);
      emberMcpClient = new Client(
        { name: 'LiquidationPreventionAgent', version: '1.0.0' },
        { capabilities: { tools: {}, resources: {}, prompts: {} } }
      );

      const transport = new StreamableHTTPClientTransport(new URL(emberEndpoint));
      await emberMcpClient.connect(transport);
      console.log('MCP client connected successfully.');
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
    }

    // if (process.env.EMBER_ENDPOINT) {
    //   try {
    //     console.log(`Connecting to MCP server at ${process.env.EMBER_ENDPOINT}`);
    //     emberMcpClient = new Client({
    //       name: 'LiquidationPreventionAgent',
    //       version: '1.0.0',
    //     });

    //     const transport = new StreamableHTTPClientTransport(new URL(process.env.EMBER_ENDPOINT));
    //     await emberMcpClient.connect(transport);
    //     console.log('MCP client connected successfully.');
    //   } catch (error) {
    //     console.error('Failed to connect to MCP server:', error);
    //   }

    if (!emberMcpClient) {
      console.error('ember-mcp-tool-server MCP client not available, agent cannot start');
      throw new Error('Failed to connect to Ember MCP server. Agent cannot function without MCP client.');
    }

    console.log('Loading token map from MCP capabilities...');
    const tokenMap = await loadTokenMapFromMcp(emberMcpClient);

    // Add the manual MCP client to the deps so tools can access it
    const updatedDeps = {
      ...deps,
      mcpClients: {
        ...deps.mcpClients,
        'ember-mcp-tool-server': emberMcpClient
      }
    };

    return contextProvider(updatedDeps, tokenMap, emberMcpClient);
  })
  .then(() => {
    console.log(`🚀 Liquidation Prevention Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n🛡️  Liquidation Prevention Features:');
    console.log('  ✅ Immediate position status checks and health factor queries');
    console.log('  ✅ Continuous health factor monitoring with automatic prevention');
    console.log('  ✅ Intelligent strategy execution when liquidation risk detected');
    console.log('  ✅ Direct manual liquidation prevention actions');
    console.log('  ✅ Configurable health factor thresholds and monitoring intervals');
    console.log('  ✅ Multi-chain support for all Ember-supported networks');
    console.log('  ✅ Token symbol resolution with comprehensive token mapping');
    console.log('\n🎯 Three-Skill Architecture:');
    console.log('  📊 Position Status: Immediate health factor and position checks');
    console.log('  🔄 Health Monitoring: Continuous monitoring + automatic prevention');
    console.log('  ⚡ Liquidation Prevention: Direct supply/repay actions');
    console.log('\n📊 Available tools: getUserPositions, getWalletBalances, monitorHealth, supplyCollateral, repayDebt');
    console.log('⚙️  User preferences: Health factors, monitoring intervals, strategies, risk tolerance, gas optimization');
  })
  .catch((error) => {
    console.error('Failed to start liquidation prevention agent:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down liquidation prevention agent gracefully...');

  // Stop all monitoring sessions
  const { stopAllMonitoringSessions } = await import('./tools/monitorHealth.js');
  const stoppedSessions = stopAllMonitoringSessions();
  if (stoppedSessions > 0) {
    console.log(`🛑 Stopped ${stoppedSessions} active monitoring sessions`);
  }

  await agent.stop();
  console.log('✅ Agent stopped successfully');
  process.exit(0);
}); 
