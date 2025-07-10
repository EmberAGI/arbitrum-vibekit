/**
 * Context Provider for Liquidation Prevention Agent
 * Loads configuration from environment variables and MCP servers
 */

import type { LiquidationPreventionContext } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export async function contextProvider(deps: { mcpClients: Record<string, Client> }): Promise<LiquidationPreventionContext> {
  console.log('[Context] Loading liquidation prevention context...');

  const { mcpClients } = deps;
  let tokenMap: Record<string, Array<{ chainId: string; address: string; decimals: number }>> = {};

  // Try to load token map from Ember MCP server
  try {
    const emberMcpClient = mcpClients['ember-mcp-tool-server'];
    
    if (emberMcpClient) {
      console.log('[Context] Found Ember MCP client, loading token map...');
      
      // Call the getTokenMap tool if available
      try {
        const response = await emberMcpClient.callTool({
          name: 'getTokenMap',
          arguments: {},
        });

        if (response.content && Array.isArray(response.content) && response.content.length > 0) {
          const firstContent = response.content[0];
          if (firstContent && 'type' in firstContent && firstContent.type === 'text' && 'text' in firstContent) {
            const data = JSON.parse(firstContent.text);
            tokenMap = data.tokenMap || {};
            console.log(`[Context] Loaded token map with ${Object.keys(tokenMap).length} tokens`);
          }
        }
      } catch (tokenMapError) {
        console.warn('[Context] Failed to load token map from Ember MCP:', tokenMapError);
        // Continue with empty token map
      }
    } else {
      console.warn('[Context] Ember MCP client not available, using empty token map');
    }
  } catch (error) {
    console.warn('[Context] Error accessing MCP clients:', error);
    // Continue with defaults
  }

  // Load configuration from environment variables with defaults
  const context: LiquidationPreventionContext = {
    thresholds: {
      warning: parseFloat(process.env.HEALTH_FACTOR_WARNING || '1.5'),
      danger: parseFloat(process.env.HEALTH_FACTOR_DANGER || '1.2'),
      critical: parseFloat(process.env.HEALTH_FACTOR_CRITICAL || '1.05'),
    },

    monitoring: {
      intervalMs: parseInt(process.env.MONITORING_INTERVAL || '60000', 10),
      maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
      gasPriceMultiplier: parseFloat(process.env.GAS_PRICE_MULTIPLIER || '1.5'),
    },

    strategy: {
      default: (process.env.DEFAULT_STRATEGY as 'auto' | '1' | '2' | '3') || 'auto',
      minSupplyBalanceUsd: parseFloat(process.env.MIN_SUPPLY_BALANCE_USD || '100'),
      minRepayBalanceUsd: parseFloat(process.env.MIN_REPAY_BALANCE_USD || '50'),
      maxTransactionUsd: parseFloat(process.env.MAX_TRANSACTION_USD || '10000'),
    },

    tokenMap,

    quicknode: {
      subdomain: process.env.QUICKNODE_SUBDOMAIN || '',
      apiKey: process.env.QUICKNODE_API_KEY || '',
    },

    security: {
      enableWebhooks: process.env.ENABLE_WEBHOOKS === 'true',
      webhookUrl: process.env.WEBHOOK_URL,
      rateLimitRpm: parseInt(process.env.RATE_LIMIT_RPM || '60', 10),
    },

    loadedAt: new Date(),

    metadata: {
      mcpServersConnected: Object.keys(mcpClients).length,
      environment: process.env.NODE_ENV || 'development',
      agentVersion: process.env.AGENT_VERSION || '1.0.0',
      debugMode: process.env.DEBUG_MODE === 'true',
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
