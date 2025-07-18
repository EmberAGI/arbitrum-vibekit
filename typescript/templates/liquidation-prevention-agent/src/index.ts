#!/usr/bin/env node
/**
 * Liquidation Prevention Agent
 * Monitors health factors and automatically prevents liquidations using strategic interventions
 */

import 'dotenv/config';
import { Agent, type AgentConfig } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { contextProvider } from './context/provider.js';
import { loadTokenMapFromMcp } from './tokenMap.js';

// Import implemented skills
import { healthMonitoringSkill } from './skills/healthMonitoring.js';
import { liquidationPreventionSkill } from './skills/liquidationPrevention.js';

// Skills to be implemented in future tasks
// import { riskAssessmentSkill } from './skills/riskAssessment.js';

// Create OpenRouter instance for LLM
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Export agent configuration for testing
export const agentConfig: AgentConfig = {
  name: process.env.AGENT_NAME || 'Liquidation Prevention Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description: process.env.AGENT_DESCRIPTION || 'Aave liquidation prevention agent that monitors health factors and prevents liquidations',
  skills: [
    healthMonitoringSkill,         // ✅ Implemented: Task 2
    liquidationPreventionSkill,    // ✅ Implemented: Task 3.1
    // riskAssessmentSkill,        // 🔄 To be implemented: Task 4
  ],
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
    model: openrouter(process.env.LLM_MODEL || 'deepseek/deepseek-chat-v3-0324:free'),
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
    console.log('  ✅ Health factor monitoring with risk assessment');
    console.log('  ✅ Periodic position monitoring with change detection');  
    console.log('  ✅ Wallet balance analysis for liquidation strategies');
    console.log('  ✅ Strategy 1: Supply more collateral (supplyCollateral)');
    console.log('  ✅ Strategy 2: Repay debt (repayDebt)');
    console.log('  ✅ Strategy 3: Intelligent automatic strategy selection');
    console.log('  ✅ Task 4.1: Configurable health factor thresholds');
    console.log('  ✅ Task 4.2: Configurable monitoring intervals');
    console.log('  ✅ Task 4.3: User preference parsing from instructions');
    console.log('\n⚡ Current Status: Task 4.3 (Configuration & Safety Features) COMPLETED');
    console.log('📊 Available tools: getUserPositions, getWalletBalances, monitorHealth, supplyCollateral, repayDebt, intelligentPreventionStrategy');
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
