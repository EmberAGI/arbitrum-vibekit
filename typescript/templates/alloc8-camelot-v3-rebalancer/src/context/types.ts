import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { AgentConfig } from '../config/types.js';
import type TelegramBot from 'node-telegram-bot-api';
import type { LanguageModelV1 } from 'ai';

/**
 * Context shared across all tools and skills
 */
export interface RebalancerContext {
  // Configuration
  config: AgentConfig;

  // MCP clients
  mcpClients: Record<string, Client>;

  // LLM model
  llm?: LanguageModelV1;

  // Telegram bot (if configured)
  telegramBot?: TelegramBot;

  // Blockchain provider
  rpcProvider: {
    url: string;
    // Add more provider-specific properties as needed
  };

  // Current monitoring state
  monitoringState: {
    isActive: boolean;
    currentPositions: string[];
    lastCheck: Date | null;
    taskId: string | null;
  };
}

/**
 * Dependencies provided by the agent framework
 */
export interface ContextDependencies {
  mcpClients: Record<string, Client>;
  llmModel?: LanguageModelV1; // LLM model from provider selector
}
