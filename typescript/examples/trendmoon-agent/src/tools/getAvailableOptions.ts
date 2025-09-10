import { z } from 'zod';
import {
  type VibkitToolDefinition,
  createSuccessTask,
  createErrorTask,
  VibkitError,
  withHooks,
} from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import { entityResolver } from '../services/entityResolver.js';
import { entityResolutionHook } from '../hooks/index.js';
import type { TrendmoonContext } from '../context/types.js';

const GetAvailableOptionsSchema = z.object({
  option_type: z
    .enum(['categories', 'platforms', 'both'])
    .default('both')
    .describe('What type of options to retrieve: categories (narratives), platforms (chains), or both.'),
});

const baseGetAvailableOptionsTool: VibkitToolDefinition<typeof GetAvailableOptionsSchema> = {
  name: 'get_available_options',
  description:
    'Get all available categories (narratives) and blockchain platforms that can be used for filtering crypto analysis. Use this when users ask what categories or chains are available.',
  parameters: GetAvailableOptionsSchema,

  execute: async (args, context): Promise<Task> => {
    const mcpClient = context.mcpClients?.['trendmoon-mcp-server'];
    if (!mcpClient) {
      return createErrorTask(
        'mcp-client-error',
        new VibkitError('ClientError', -32603, 'Trendmoon MCP client not available.'),
      );
    }

    try {
      // Ensure entity resolver is initialized with latest data
      await entityResolver.initialize(mcpClient);

      const cacheInfo = entityResolver.getCacheInfo();
      if (!cacheInfo.isInitialized) {
        return createErrorTask(
          'cache-error',
          new VibkitError('ExecutionError', -32603, 'Entity cache is not initialized.'),
        );
      }

      let response = '';

      if (args.option_type === 'categories' || args.option_type === 'both') {
        const categories = entityResolver.getAvailableCategories();
        response += `**Available Categories/Narratives (${categories.length} total):**\n\n`;

        // Group categories for better readability
        const mainCategories = categories
          .filter((cat) =>
            ['AI', 'DeFi', 'Gaming', 'Meme', 'Layer 1', 'Layer 2', 'Real World Assets', 'SocialFi', 'NFT'].some(
              (main) => cat.includes(main),
            ),
          )
          .slice(0, 20); // Show first 20 main ones

        response += mainCategories.map((cat) => `• ${cat}`).join('\n') + '\n\n';
        response += `*And ${categories.length - 20} more categories available...*\n\n`;
      }

      if (args.option_type === 'platforms' || args.option_type === 'both') {
        const platforms = entityResolver.getAvailablePlatforms();
        response += `**Available Blockchain Platforms (${platforms.length} total):**\n\n`;

        // Show main platforms
        const mainPlatforms = platforms.filter((plat) =>
          ['ethereum', 'arbitrum', 'base', 'polygon', 'solana', 'avalanche', 'optimistic', 'binance'].some((main) =>
            plat.toLowerCase().includes(main),
          ),
        );

        response += mainPlatforms.map((plat) => `• ${plat}`).join('\n') + '\n\n';
        response += `*And ${platforms.length - mainPlatforms.length} more platforms available...*\n\n`;
      }

      response += `📊 **Cache Info:** Last updated ${Math.round(cacheInfo.cacheAge / 60000)} minutes ago`;

      return createSuccessTask('options-retrieved', undefined, response);
    } catch (error) {
      console.error(`[Tool:get_available_options] Error:`, error);
      return createErrorTask(
        'execution-error',
        new VibkitError('ExecutionError', -32603, 'Failed to retrieve available options.'),
      );
    }
  },
};

export const getAvailableOptionsTool = withHooks(baseGetAvailableOptionsTool, {
  before: entityResolutionHook,
});
