/**
 * Context Provider for Liquidation Prevention Agent
 * Loads configuration from environment variables and MCP servers
 */

import type { LiquidationPreventionContext } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TransactionExecutor } from '../utils/transactionExecutor.js';

export async function contextProvider(
  deps: { mcpClients: Record<string, Client> },
  tokenMap: Record<string, Array<{ chainId: string; address: string; decimals: number }>>,
  emberMcpClient: Client
): Promise<LiquidationPreventionContext> {
  console.log('[Context] Loading liquidation prevention context...');

  const { mcpClients } = deps;
  console.log(`[Context] Received token map with ${Object.keys(tokenMap).length} tokens`);

  // Set up user account from private key
  const userPrivateKey = process.env.USER_PRIVATE_KEY;
  if (!userPrivateKey) {
    throw new Error('USER_PRIVATE_KEY not found in .env file. This is required for transaction execution.');
  }

  const quicknodeSubdomain = process.env.QUICKNODE_SUBDOMAIN;
  const quicknodeApiKey = process.env.QUICKNODE_API_KEY;
  if (!quicknodeSubdomain || !quicknodeApiKey) {
    throw new Error('QUICKNODE_SUBDOMAIN and QUICKNODE_API_KEY must be set in .env file for transaction execution.');
  }

  // Create account from private key
  const account = privateKeyToAccount(userPrivateKey as `0x${string}`);
  const userAddress: Address = account.address;
  console.log(`[Context] Using wallet address: ${userAddress}`);

  // Create transaction executor
  const transactionExecutor = new TransactionExecutor(
    account,
    userAddress,
    quicknodeSubdomain,
    quicknodeApiKey
  );

  // Load configuration from environment variables with defaults
  const context: LiquidationPreventionContext = {
    // User wallet information
    userAddress,
    account,

    // MCP client for Ember API calls
    mcpClient: emberMcpClient,

    // Transaction execution function
    executeTransaction: transactionExecutor.executeTransactions.bind(transactionExecutor),

    thresholds: {
      warning: parseFloat(process.env.HEALTH_FACTOR_WARNING || '1.5'),
      danger: parseFloat(process.env.HEALTH_FACTOR_DANGER || '1.1'),
      critical: parseFloat(process.env.HEALTH_FACTOR_CRITICAL || '1.03'),
    },

    monitoring: {
      intervalMs: parseInt(process.env.MONITORING_INTERVAL || '900000', 10),
    },

    tokenMap,

    quicknode: {
      subdomain: process.env.QUICKNODE_SUBDOMAIN || '',
      apiKey: process.env.QUICKNODE_API_KEY || '',
    },

    loadedAt: new Date(),

    metadata: {
      mcpServersConnected: Object.keys(mcpClients).length,
      environment: process.env.NODE_ENV || 'development',
      agentVersion: process.env.AGENT_VERSION || '1.0.0',
    },
  };

  console.log('[Context] Liquidation prevention context loaded successfully:', {
    thresholds: context.thresholds,
    tokenMapSize: Object.keys(context.tokenMap).length,
    mcpServersConnected: context.metadata.mcpServersConnected,
    environment: context.metadata.environment,
  });

  return context;
} 
