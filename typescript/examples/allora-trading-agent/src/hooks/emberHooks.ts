/**
 * Hooks for Ember MCP Tools
 * Pre-hook: Maps token symbol to token address and chain ID
 */

import type { HookFunction } from 'arbitrum-vibekit-core';

// Pre-hook: Discovers the address and chain ID for a given token
export const tokenDiscoveryHook: HookFunction<any, any, any, any> = async (args, context) => {
  console.log('[TokenDiscoveryHook] Looking up token address and chain ID for token:', args.token);

  const emberClient = context.mcpClients?.['ember-mcp-tool-server'];
  if (!emberClient) {
    throw new Error('Ember MCP client not available');
  }

  try {
    // Call getTokens to get available tokens
    const tokensResponse = await emberClient.callTool({
      name: 'getTokens',
      arguments: {}, // Adjust if getTokens requires arguments like chainId
    });

    // Parse the response to find tokens
    const content = tokensResponse.content;
    const parsed =
      content && Array.isArray(content) && content.length > 0 && content[0].text
        ? JSON.parse(content[0].text)
        : undefined;

    // Determine tokens list shape
    let tokensList: any[] = [];
    if (Array.isArray(parsed)) {
      tokensList = parsed;
    } else if (Array.isArray(parsed?.tokens)) {
      tokensList = parsed.tokens;
    } else if (parsed && typeof parsed.tokens === 'object') {
      tokensList = Object.values(parsed.tokens);
    }

    if (tokensList.length === 0) {
      throw new Error('No tokens data found in getTokens response');
    }

    // Look for a token that matches the symbol (case-insensitive)
    const tokenUpper = args.token.toUpperCase();
    const matchingToken = tokensList.find((t: any) => (t.symbol || '').toUpperCase() === tokenUpper);

    if (!matchingToken || !matchingToken.tokenUid) {
      throw new Error(`No token address found for symbol: ${args.token}`);
    }

    console.log(`[TokenDiscoveryHook] Found token for ${args.token}:`, matchingToken.tokenUid);

    // Return modified args with token address and chainId added
    return {
      ...args,
      tokenAddress: matchingToken.tokenUid.address,
      tokenChainId: matchingToken.tokenUid.chainId,
    };
  } catch (error) {
    console.error('[TokenDiscoveryHook] Error:', error);
    throw error;
  }
};
