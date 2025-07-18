/**
 * Context types for Liquidation Prevention Agent
 * Defines configuration and thresholds for liquidation prevention
 */

import type { Address, LocalAccount } from 'viem';
import type { TransactionPlan } from 'ember-schemas';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export interface LiquidationPreventionContext {
  // User wallet information
  userAddress: Address;
  account: LocalAccount<string>;
  
  // MCP client for Ember API calls
  mcpClient: Client;
  
  // Transaction execution function
  executeTransaction: (actionName: string, transactions: TransactionPlan[]) => Promise<string>;
  // Health factor thresholds for risk assessment
  thresholds: {
    warning: number;
    danger: number;
    critical: number;
  };

  // Monitoring configuration
  monitoring: {
    intervalMs: number;
    maxRetryAttempts: number;
    gasPriceMultiplier: number;
  };

  // Strategy selection configuration
  strategy: {
    default: 'auto' | '1' | '2' | '3';
    minSupplyBalanceUsd: number;
    minRepayBalanceUsd: number;
    maxTransactionUsd: number;
  };

  // Token mapping loaded from Ember MCP (if available)
  tokenMap: Record<string, Array<{ chainId: string; address: string; decimals: number }>>;

  // QuickNode configuration for enhanced monitoring
  quicknode: {
    subdomain: string;
    apiKey: string;
  };

  // Security and operational settings
  security: {
    enableWebhooks: boolean;
    webhookUrl?: string;
    rateLimitRpm: number;
  };

  // When the context was loaded
  loadedAt: Date;

  // Metadata about the agent's configuration
  metadata: {
    mcpServersConnected: number;
    environment: string;
    agentVersion: string;
    debugMode: boolean;
  };
} 
