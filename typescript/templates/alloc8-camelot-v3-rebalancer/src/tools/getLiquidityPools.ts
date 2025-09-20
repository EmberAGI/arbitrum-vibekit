import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { PoolState } from '../config/types.js';

const getLiquidityPoolsParametersSchema = z.object({
  poolAddress: z.string().optional().describe('Specific pool address to get data for'),
  token0: z.string().optional().describe('First token symbol to filter pools'),
  token1: z.string().optional().describe('Second token symbol to filter pools'),
});

type GetLiquidityPoolsParams = z.infer<typeof getLiquidityPoolsParametersSchema>;

/**
 * Get liquidity pool data from Camelot v3
 */
export const getLiquidityPoolsTool: VibkitToolDefinition<
  typeof getLiquidityPoolsParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'getLiquidityPools',
  description:
    'Retrieve pool state data from Camelot v3 including price, liquidity, and volume information',
  parameters: getLiquidityPoolsParametersSchema,

  execute: async (params: GetLiquidityPoolsParams, context: { custom: RebalancerContext }) => {
    try {
      console.log('🔍 Getting liquidity pool data...');

      // Call Ember MCP server to get pool data
      const emberClient = context.custom.mcpClients['ember-onchain'];
      if (!emberClient) {
        throw new Error('Ember MCP client not available');
      }

      const response = await emberClient.callTool({
        name: 'getLiquidityPools',
        arguments: {
          poolAddress: params.poolAddress,
          token0: params.token0,
          token1: params.token1,
          protocol: 'camelot-v3',
        },
      });

      if (!response || !response.content || !Array.isArray(response.content)) {
        throw new Error('No response from MCP server');
      }

      const firstContent = response.content[0];
      if (!firstContent || !('text' in firstContent)) {
        throw new Error('Invalid response format from MCP server');
      }
      const pools: PoolState[] = JSON.parse(firstContent.text);

      console.log(`✅ Retrieved data for ${pools.length} pools`);

      // Log key pool metrics
      pools.forEach(pool => {
        console.log(`   Pool: ${pool.token0}/${pool.token1}`);
        console.log(`   Price: $${parseFloat(pool.price).toFixed(6)}`);
        console.log(`   TVL: $${parseFloat(pool.tvl).toLocaleString()}`);
        console.log(`   Volume 24h: $${parseFloat(pool.volume24h).toLocaleString()}`);
      });

      return createSuccessTask(
        'getLiquidityPools',
        [
          {
            artifactId: 'getLiquidityPools-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(pools) }],
          },
        ],
        'Operation completed successfully'
      );
    } catch (error) {
      console.error('❌ Error getting liquidity pools:', error);
      return createErrorTask(
        'getLiquidityPools',
        error instanceof Error ? error : new Error('Failed to get pool data: ${error}')
      );
    }
  },
};
