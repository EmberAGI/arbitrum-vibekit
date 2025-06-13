/**
 * Get Current Price Tool
 * Uses Ember MCP to fetch the current market price for a token.
 * Enhanced with a hook for token discovery.
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask, withHooks, VibkitError } from 'arbitrum-vibekit-core';
import { tokenDiscoveryHook } from '../hooks/emberHooks.js';
import { parseTokenFromMessageHook } from '../hooks/parseTokenFromMessageHook.js';

// Tool parameters schema
const GetCurrentPriceParams = z.object({
  token: z.string().describe('Token symbol (e.g., BTC, ETH)'),
});

// Base tool that expects tokenAddress and tokenChainId (will be added by pre-hook)
const baseGetCurrentPriceTool: VibkitToolDefinition<typeof GetCurrentPriceParams, any, any, any> = {
  name: 'get-current-price',
  description: 'Get the current market price for a specific token from Ember. Returns the current price value.',
  parameters: GetCurrentPriceParams,
  execute: async (args: any, context) => {
    console.log('[GetCurrentPrice] Executing with args:', args);

    // tokenAddress and tokenChainId should have been added by the pre-hook
    if (!args.tokenAddress || !args.tokenChainId) {
      return createErrorTask(
        'get-price',
        new VibkitError('TokenDiscoveryError', -32603, 'Token discovery may have failed.'),
      );
    }

    const emberClient = context.mcpClients?.['ember-mcp-tool-server'];
    if (!emberClient) {
      return createErrorTask('get-price', new VibkitError('ClientError', -32603, 'Ember MCP client not available'));
    }

    try {
      const marketDataResponse = await emberClient.callTool({
        name: 'getMarketData',
        arguments: {
          tokenAddress: args.tokenAddress,
          tokenChainId: args.tokenChainId,
        },
      });

      const content = marketDataResponse.content;
      const marketData =
        content && Array.isArray(content) && content.length > 0 && content[0].text ? JSON.parse(content[0].text) : {};

      const price = marketData.price;

      if (price === undefined) {
        return createErrorTask(
          'get-price',
          new VibkitError('PriceUnavailable', -32603, 'Price is not available in the market data response.'),
        );
      }

      // Return only the raw price for tool chaining
      return createSuccessTask(
        'get-price',
        undefined, // no artifacts
        String(price),
      );
    } catch (error) {
      console.error('[GetCurrentPrice] Error:', error);
      return createErrorTask(
        'get-price',
        new VibkitError(
          'PriceError',
          -32603,
          `Failed to get current price: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  },
};

// Export the tool wrapped with the discovery hook
export const getCurrentPriceTool = withHooks(baseGetCurrentPriceTool, {
  before: async (args, context) => {
    const withToken = await parseTokenFromMessageHook(args, context);
    return tokenDiscoveryHook(withToken, context);
  },
});
