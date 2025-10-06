import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { PoolPosition } from '../config/types.js';

const getWalletLiquidityPositionsParametersSchema = z.object({
  walletAddress: z.string().describe('Wallet address to check positions for'),
  poolAddress: z.string().optional().describe('Optional pool address to filter positions'),
});

type GetWalletLiquidityPositionsParams = z.infer<
  typeof getWalletLiquidityPositionsParametersSchema
>;

/**
 * Get wallet liquidity positions from Camelot v3
 */
export const getWalletLiquidityPositionsTool: VibkitToolDefinition<
  typeof getWalletLiquidityPositionsParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'getWalletLiquidityPositions',
  description: 'Retrieve all liquidity positions for a wallet address from Camelot v3',
  parameters: getWalletLiquidityPositionsParametersSchema,

  execute: async (
    params: GetWalletLiquidityPositionsParams,
    context: { custom: RebalancerContext }
  ) => {
    try {
      console.log(`🔍 Getting liquidity positions for wallet: ${params.walletAddress}`);

      // Call Ember MCP server to get wallet positions
      const emberClient = context.custom.mcpClients['ember-onchain'];
      if (!emberClient) {
        throw new Error('Ember MCP client not available');
      }

      const response = await emberClient.callTool({
        name: 'getWalletLiquidityPositions',
        arguments: {
          walletAddress: params.walletAddress,
          poolAddress: params.poolAddress,
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
      const positions: PoolPosition[] = JSON.parse(firstContent.text);

      console.log(`✅ Found ${positions.length} liquidity positions`);

      // Create artifacts for the positions
      const artifacts = positions.map(position => ({
        artifactId: `position-${position.positionId}`,
        parts: [{ kind: 'text' as const, text: JSON.stringify(position) }],
      }));

      return createSuccessTask(
        'getWalletLiquidityPositions',
        artifacts,
        `Found ${positions.length} liquidity positions`
      );
    } catch (error) {
      console.error('❌ Error getting wallet liquidity positions:', error);
      const vibkitError = error instanceof Error ? error : new Error('Unknown error');
      return createErrorTask('getWalletLiquidityPositions', vibkitError);
    }
  },
};
