/**
 * Context Provider for Ember Agent
 * Loads shared context including token map from Ember MCP server
 */

import type { EmberContext, ContextDependencies, TokenInfo } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { LanguageModelV1 } from 'ai';
import { Address, isAddress } from 'viem';

/**
 * Load token map from Ember MCP server
 */
async function loadTokenMap(mcpClient: Client): Promise<Record<string, TokenInfo[]>> {
  try {
    console.log('[Context] Loading token map from Ember MCP server...');

    const timeout = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || '30000', 10);

    const response = await mcpClient.callTool(
      {
        name: 'getCapabilities',
        arguments: { type: 'TOKEN_MAP' },
      },
      undefined,
      { timeout }
    );

    if (response && typeof response === 'object' && 'structuredContent' in response) {
      const data = (response as any).structuredContent;

      if (data && typeof data === 'object' && 'tokens' in data) {
        const tokenMap: Record<string, TokenInfo[]> = {};
        let loadedCount = 0;

        // Process tokens from the response
        for (const [symbol, tokens] of Object.entries(data.tokens)) {
          if (Array.isArray(tokens)) {
            tokenMap[symbol.toUpperCase()] = tokens.map((token: any) => ({
              chainId: token.chainId,
              address: token.address,
              decimals: token.decimals || 18,
              symbol: token.symbol || symbol,
              name: token.name,
            }));
            loadedCount++;
          }
        }

        console.log(`[Context] Loaded ${loadedCount} token symbols from Ember MCP`);
        return tokenMap;
      }
    }

    console.warn('[Context] No tokens found in Ember MCP response');
    return {};
  } catch (error) {
    console.error('[Context] Error loading token map from Ember MCP:', error);
    console.warn('[Context] Using empty token map due to MCP error');
    return {};
  }
}

/**
 * Validate and parse user address from environment
 */
function parseUserAddress(addressString?: string): Address | undefined {
  if (!addressString) return undefined;

  if (isAddress(addressString)) {
    return addressString as Address;
  }

  console.warn(`[Context] Invalid default user address: ${addressString}`);
  return undefined;
}

/**
 * Context provider function for Ember Agent
 */
export async function contextProvider(
  deps: ContextDependencies & { llmModel: LanguageModelV1 }
): Promise<EmberContext> {
  console.log('[Context] Initializing Ember Agent context...');

  const { mcpClients, llmModel } = deps;

  // Find the Ember MCP client
  const emberMcpClient =
    Object.entries(mcpClients).find(
      ([name]) => name.includes('ember') || name.includes('mcp-tool-server')
    )?.[1] || null;

  let tokenMap: Record<string, TokenInfo[]> = {};
  let mcpConnected = false;

  if (emberMcpClient) {
    console.log('[Context] Found Ember MCP client, loading token map...');
    tokenMap = await loadTokenMap(emberMcpClient);
    mcpConnected = true;
  } else {
    console.warn('[Context] No Ember MCP client found - token map will be empty');
    console.warn('[Context] Expected MCP client name containing "ember" or "mcp-tool-server"');
    console.warn('[Context] Available MCP clients:', Object.keys(mcpClients));
  }

  // Parse configuration from environment
  const arbitrumRpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
  const emberMcpServerUrl = process.env.EMBER_MCP_SERVER_URL || '';
  const defaultUserAddress = parseUserAddress(process.env.DEFAULT_USER_ADDRESS);
  const enableCaching = process.env.AGENT_CACHE_TOKENS === 'true';

  // Count available tokens
  const tokenCount = Object.values(tokenMap).reduce((count, tokens) => count + tokens.length, 0);

  // Create the context
  const context: EmberContext = {
    // Shared resources
    mcpClient: emberMcpClient,
    tokenMap,
    userAddress: defaultUserAddress,
    llmModel,

    // Configuration
    config: {
      arbitrumRpcUrl,
      emberMcpServerUrl,
      defaultUserAddress,
      enableCaching,
    },

    // Metadata
    metadata: {
      loadedAt: new Date(),
      mcpConnected,
      tokenCount,
      availableSkills: [
        // Will be populated as skills are implemented
        'swapping',
        'lending',
        'liquidity',
        'pendle',
        'documentation',
      ],
      environment: process.env.NODE_ENV || 'development',
    },
  };

  // Log context summary
  console.log('[Context] Ember Agent context loaded successfully:');
  console.log(`  - MCP Connected: ${mcpConnected ? '✅' : '❌'}`);
  console.log(`  - Token Map: ${Object.keys(tokenMap).length} symbols, ${tokenCount} tokens`);
  console.log(`  - Default User: ${defaultUserAddress || 'not set'}`);
  console.log(`  - RPC URL: ${arbitrumRpcUrl}`);
  console.log(`  - Environment: ${context.metadata.environment}`);
  console.log(`  - Caching: ${enableCaching ? 'enabled' : 'disabled'}`);

  if (Object.keys(tokenMap).length > 0) {
    const sampleTokens = Object.keys(tokenMap).slice(0, 5);
    console.log(
      `  - Sample tokens: ${sampleTokens.join(', ')}${Object.keys(tokenMap).length > 5 ? '...' : ''}`
    );
  }

  return context;
}
