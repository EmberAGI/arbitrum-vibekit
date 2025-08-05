/**
 * Context Provider for Trendmoon Agent
 * Demonstrates loading context from MCP servers
 */

import type { TrendmoonContext } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { entityResolver } from '../services/entityResolver.js';

export async function contextProvider(deps: { mcpClients: Record<string, any> }): Promise<TrendmoonContext> {
  console.error('[Context] Loading Trendmoon context from MCP servers...');

  const { mcpClients } = deps;
  let categories: string[] = [];
  let platforms: string[] = [];

  // Try to load categories and platforms from the trendmoon MCP server
  try {
    const trendmoonClient = mcpClients['trendmoon-mcp-server'];

    if (trendmoonClient) {
      console.error('[Context] Found trendmoon MCP client, initializing entity resolver...');

      // Initialize the entity resolver with the MCP client
      await entityResolver.initialize(trendmoonClient);

      // We don't need to manually load categories/platforms here since 
      // the entityResolver handles caching internally
      console.error('[Context] Entity resolver initialized successfully');
    } else {
      console.error('[Context] No trendmoon MCP client found');
    }
  } catch (error) {
    console.error('[Context] Error initializing entity resolver from MCP:', error);
    // Continue with empty arrays - the resolver will fall back to local files
  }

  // Create the context
  const context: TrendmoonContext = {
    loadedAt: new Date(),
    categories,
    platforms,
    metadata: {
      mcpServersConnected: Object.keys(mcpClients).length,
      environment: process.env.NODE_ENV || 'development',
      cacheLastUpdated: new Date(),
    },
  };

  console.error('[Context] Trendmoon context loaded successfully:', {
    mcpServersConnected: context.metadata.mcpServersConnected,
    environment: context.metadata.environment,
  });

  return context;
}
