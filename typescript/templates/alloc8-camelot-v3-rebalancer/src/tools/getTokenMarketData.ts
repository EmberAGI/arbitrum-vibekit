import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { TokenMarketData } from '../config/types.js';

const getTokenMarketDataParametersSchema = z.object({
  tokens: z.array(z.string()).describe('Array of token symbols to get market data for'),
  includeVolatility: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include volatility calculations'),
});

type GetTokenMarketDataParams = z.infer<typeof getTokenMarketDataParametersSchema>;

/**
 * Get token market data including prices, volume, and volatility
 */
export const getTokenMarketDataTool: VibkitToolDefinition<
  typeof getTokenMarketDataParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'getTokenMarketData',
  description:
    'Retrieve live market data for tokens including price, volume, market cap, and volatility metrics',
  parameters: getTokenMarketDataParametersSchema,

  execute: async (params: GetTokenMarketDataParams, context: { custom: RebalancerContext }) => {
    try {
      console.log(`🔍 Getting market data for tokens: ${params.tokens.join(', ')}`);

      // Note: Ember MCP server doesn't have a direct getTokenMarketData tool
      // This would need to be implemented using a different approach
      throw new Error(
        'Token market data functionality not available through Ember MCP server. Please use a different integration.'
      );
    } catch (error) {
      console.error('❌ Error getting token market data:', error);
      return createErrorTask(
        'getTokenMarketData',
        error instanceof Error ? error : new Error('Failed to get market data: ${error}')
      );
    }
  },
};
