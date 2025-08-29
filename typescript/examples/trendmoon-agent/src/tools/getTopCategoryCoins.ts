import { z } from 'zod';
import {
  type VibkitToolDefinition,
  createSuccessTask,
  createErrorTask,
  VibkitError,
  withHooks,
} from 'arbitrum-vibekit-core';
import { entityResolutionHook } from '../hooks/index.js';

const GetTopCategoryCoinsSchema = z.object({
  category_name: z.string().describe('Category name (e.g., Meme, DeFi, RWA)'),
  limit: z.number().min(1).max(100).default(20).describe('Number of top coins to return (1-100)'),
  sort_by: z.enum([
    'score', 'technical_indicator_score', 'social_indicator_score', 
    'social_mentions', 'market_cap', 'day_perc_diff',
    'lc_social_dominance', 'day_social_perc_diff', 'lc_interactions', 
    'lc_sentiment', 'lc_social_volume_24h', 'lc_galaxy_score'
  ]).default('lc_social_dominance').describe('Metric to sort by'),
  max_coins_to_analyze: z.number().min(10).max(250).default(200).describe('Max coins to analyze (10-250)')
});

const baseGetTopCategoryCoins: VibkitToolDefinition<typeof GetTopCategoryCoinsSchema> = {
  name: 'get_top_category_coins',
  description: 'Get top coins from a specific category sorted by any metric including mindshare (social dominance), sentiment, interactions, or technical scores. Perfect for queries like "top mindshare meme coins" or "highest sentiment DeFi tokens".',
  parameters: GetTopCategoryCoinsSchema,

  execute: async (args, context) => {
    const mcpClient = context.mcpClients?.['trendmoon-mcp-server'];
    if (!mcpClient) {
      return createErrorTask(
        'mcp-client-error',
        new VibkitError('ClientError', -32603, 'Trendmoon MCP client not available.'),
      );
    }

    try {
      console.log(`[Tool:get_top_category_coins] Calling MCP with category: ${args.category_name}, sort_by: ${args.sort_by}`);

      const mcpResponse = await mcpClient.callTool({
        name: 'getTopCategoryCoins',
        arguments: args
      });

      console.log('[DEBUG] MCP Response:', JSON.stringify(mcpResponse, null, 2));
      
      if (!mcpResponse.content || !Array.isArray(mcpResponse.content) || mcpResponse.content.length === 0) {
        return createErrorTask('mcp-call-error', new VibkitError('ExecutionError', -32603, 'No content in MCP response.'));
      }

      // Extract the formatted text response
      let formattedText = '';
      for (const content of mcpResponse.content) {
        if (content.type === 'text') {
          formattedText = content.text;
          break;
        }
      }

      const finalMessage = formattedText || 'Successfully retrieved top category coins data. Check the structured data for details.';
      
      return createSuccessTask('category-coins-retrieved', undefined, finalMessage);

    } catch (error) {
      console.error(`[Tool:get_top_category_coins] Error during MCP call:`, error);
      return createErrorTask('mcp-call-error', new VibkitError('ExecutionError', -32603, 'Failed to get top category coins from the Trendmoon MCP server.'));
    }
  },
};

export const getTopCategoryCoins = withHooks(baseGetTopCategoryCoins, {
  before: entityResolutionHook,
}); 