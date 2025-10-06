// Context provider type - function that returns context
import TelegramBot from 'node-telegram-bot-api';
import { loadAgentConfig } from '../config/index.js';
import type { RebalancerContext, ContextDependencies } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Context provider for the rebalancing agent
 * Provides shared resources and configuration to all tools and skills
 */
export const contextProvider = async (deps: ContextDependencies): Promise<RebalancerContext> => {
  // Load configuration
  const config = loadAgentConfig();

  // Initialize Telegram bot if configured
  let telegramBot: TelegramBot | undefined;
  if (config.telegramBotToken) {
    telegramBot = new TelegramBot(config.telegramBotToken, { polling: false });
    console.log('✅ Telegram bot initialized');
  } else {
    console.log('⚠️  Telegram bot not configured (TELEGRAM_BOT_TOKEN missing)');
  }

  // Get Ember MCP client
  const emberClient = deps.mcpClients['ember-onchain'];
  if (!emberClient) {
    console.warn('⚠️  Ember MCP client not available - some features may not work');
  }

  console.log('✅ Context provider initialized');
  console.log(`   - Mode: ${config.mode}`);
  console.log(`   - Risk Profile: ${config.riskProfile}`);
  console.log(`   - Pool: ${config.token0}/${config.token1}`);
  console.log(`   - Check Interval: ${config.checkInterval / 1000}s`);

  return {
    config,
    mcpClients: deps.mcpClients,
    llm: deps.llmModel,
    telegramBot,
    rpcProvider: {
      url: config.arbitrumRpcUrl,
    },
    monitoringState: {
      isActive: false,
      currentPositions: [],
      lastCheck: null,
      taskId: null,
    },
  } as RebalancerContext;
};
