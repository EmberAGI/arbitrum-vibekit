#!/usr/bin/env node
/**
 * Liquidation Prevention Agent
 * Monitors health factors and automatically prevents liquidations using strategic interventions
 */

import 'dotenv/config';
import { Agent, type AgentConfig } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { contextProvider } from './context/provider.js';
import type { LiquidationPreventionContext } from './context/types.js';

// Import implemented skills
import { healthMonitoringSkill } from './skills/healthMonitoring.js';

// Skills to be implemented in future tasks
// import { liquidationPreventionSkill } from './skills/liquidationPrevention.js';
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
  protocolVersion: '1.0.0',
  skills: [
    healthMonitoringSkill,         // ✅ Implemented: Task 2
    // liquidationPreventionSkill, // 🔄 To be implemented: Task 3
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
  .start(PORT, contextProvider)
  .then(() => {
    console.log(`🚀 Liquidation Prevention Agent running on port ${PORT}`);
    console.log(`📍 Base URL: http://localhost:${PORT}`);
    console.log(`🤖 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`🔌 MCP SSE: http://localhost:${PORT}/sse`);
    console.log('\n🛡️  Liquidation Prevention Features:');
    console.log('  ✅ Health factor monitoring with risk assessment');
    console.log('  ✅ Periodic position monitoring with change detection');  
    console.log('  ✅ Wallet balance analysis for liquidation strategies');
    console.log('  🔄 Strategy 1: Supply more collateral (Task 3)');
    console.log('  🔄 Strategy 2: Repay debt (Task 3)');
    console.log('  🔄 Strategy 3: Combined approach (Task 3)');
    console.log('  🔄 Risk assessment and strategy selection (Task 4)');
    console.log('\n⚡ Current Status: Task 2 (Core Monitoring) COMPLETED');
    console.log('📊 Available tools: getUserPositions, getWalletBalances, monitorHealth');
  })
  .catch((error) => {
    console.error('Failed to start liquidation prevention agent:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down liquidation prevention agent gracefully...');
  await agent.stop();
  process.exit(0);
}); 
