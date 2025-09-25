import 'dotenv/config';
import type { AgentConfig as VibekitAgentConfig } from 'arbitrum-vibekit-core';
import { AgentConfigSchema, type AgentConfig } from './types.js';
import { rebalancingSkill } from '../skills/rebalancingSkill.js';
import { monitoringSkill } from '../skills/monitoringSkill.js';

/**
 * Load and validate agent configuration from environment variables
 */
export function loadAgentConfig(): AgentConfig {
  const config = {
    mode: process.env.REBALANCER_MODE || 'passive',
    riskProfile: process.env.RISK_PROFILE || 'medium',
    discoveryMode: process.env.DISCOVERY_MODE || 'auto-discover',
    poolId: process.env.POOL_ID,
    token0: process.env.TOKEN_0,
    token1: process.env.TOKEN_1,
    chainIds: process.env.CHAIN_IDS
      ? process.env.CHAIN_IDS.split(',').map(id => parseInt(id.trim(), 10))
      : [42161],
    checkInterval: process.env.CHECK_INTERVAL ? parseInt(process.env.CHECK_INTERVAL, 10) : 3600000,
    priceDeviationThreshold: process.env.PRICE_DEVIATION_THRESHOLD
      ? parseFloat(process.env.PRICE_DEVIATION_THRESHOLD)
      : 0.05,
    utilizationThreshold: process.env.UTILIZATION_THRESHOLD
      ? parseFloat(process.env.UTILIZATION_THRESHOLD)
      : 0.8,
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    emberMcpServerUrl: process.env.EMBER_MCP_SERVER_URL || 'https://api.emberai.xyz/mcp',
    subgraphApiKey: process.env.SUBGRAPH_API_KEY,
  };

  const result = AgentConfigSchema.safeParse(config);

  if (!result.success) {
    console.error('❌ Invalid agent configuration:');
    result.error.issues.forEach(issue => {
      console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
    });
    throw new Error('Invalid agent configuration');
  }

  return result.data;
}

/**
 * Vibekit agent configuration
 */
export const agentConfig: VibekitAgentConfig = {
  name: process.env.AGENT_NAME || 'Camelot v3 LP Rebalancing Agent',
  version: process.env.AGENT_VERSION || '1.0.0',
  description:
    process.env.AGENT_DESCRIPTION ||
    'Automated LP rebalancing agent for Camelot v3 concentrated liquidity pools with dynamic range adjustment and risk management',
  skills: [rebalancingSkill, monitoringSkill],
  url: process.env.AGENT_URL || 'localhost',
  capabilities: {
    streaming: true,
    pushNotifications: true,
    stateTransitionHistory: true,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};

// Export types
export * from './types.js';
