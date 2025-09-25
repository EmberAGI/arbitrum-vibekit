import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { PoolPosition } from '../config/types.js';
import { getWalletAddressFromPrivateKey } from '../utils/walletUtils.js';
import {
  fetchActivePositions,
  fetchMultipleWalletPositions,
  type EnhancedPoolPosition,
} from '../utils/directPositionFetcher.js';

const fetchWalletPositionsParametersSchema = z.object({
  chainIds: z
    .array(z.number())
    .optional()
    .describe('List of chain IDs to check (default: [42161] for Arbitrum)'),
  activeOnly: z
    .boolean()
    .default(true)
    .describe('Whether to fetch only active positions with liquidity > 0'),
});

type FetchWalletPositionsParams = z.infer<typeof fetchWalletPositionsParametersSchema>;

/**
 * Fetch all active LP positions for the configured wallet across multiple chains
 */
export const fetchWalletPositionsTool: VibkitToolDefinition<
  typeof fetchWalletPositionsParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'fetchWalletPositions',
  description:
    'Automatically fetch all active Camelot v3 LP positions for the configured wallet across multiple chains',
  parameters: fetchWalletPositionsParametersSchema,

  execute: async (params: FetchWalletPositionsParams, context: { custom: RebalancerContext }) => {
    try {
      // Get wallet address from private key in config
      const privateKey = context.custom.config.walletPrivateKey;
      if (!privateKey) {
        throw new Error('Wallet private key not configured');
      }

      const walletAddress = getWalletAddressFromPrivateKey(privateKey);
      console.log(`🔍 Fetching positions for wallet: ${walletAddress}`);

      // Default to Arbitrum if no chains specified
      const chainIds = params.chainIds || [42161];
      console.log(`🔍 Scanning chains: ${chainIds.join(', ')}`);

      const allPositions: EnhancedPoolPosition[] = [];

      // For now, we only support Arbitrum (chainId 42161) with direct GraphQL
      // In the future, we could add support for other chains by implementing their subgraphs
      if (chainIds.includes(42161)) {
        try {
          console.log(`\n🔍 Fetching positions from Camelot v3 subgraph for Arbitrum...`);

          const positions = await fetchActivePositions(walletAddress);
          allPositions.push(...positions);

          console.log(`📍 Found ${positions.length} positions on Arbitrum`);
        } catch (chainError) {
          console.error(`❌ Error fetching positions from Arbitrum:`, chainError);
        }
      }

      // Log warning for unsupported chains
      const unsupportedChains = chainIds.filter(id => id !== 42161);
      if (unsupportedChains.length > 0) {
        console.warn(
          `⚠️  Unsupported chains for direct fetching: ${unsupportedChains.join(', ')}. Only Arbitrum (42161) is currently supported.`
        );
      }

      console.log(`\n📊 Total active positions found: ${allPositions.length}`);

      // Create comprehensive summary statistics
      const summary = {
        walletAddress,
        totalPositions: allPositions.length,
        chainsScanned: chainIds,
        positionsByChain: chainIds.reduce(
          (acc, chainId) => {
            acc[chainId] = allPositions.filter(p => p.chainId === chainId).length;
            return acc;
          },
          {} as Record<number, number>
        ),
        inRangePositions: allPositions.filter(p => p.isInRange).length,
        outOfRangePositions: allPositions.filter(p => !p.isInRange).length,
        uniquePools: [...new Set(allPositions.map(p => p.poolAddress))].length,
        tokenPairs: [
          ...new Set(
            allPositions.map(p =>
              p.token0Symbol && p.token1Symbol
                ? `${p.token0Symbol}/${p.token1Symbol}`
                : `${p.token0}/${p.token1}`
            )
          ),
        ],
        totalUnclaimedFees: allPositions.reduce(
          (acc, p) => {
            acc.token0Fees += parseFloat(p.fees0 || '0');
            acc.token1Fees += parseFloat(p.fees1 || '0');
            return acc;
          },
          { token0Fees: 0, token1Fees: 0 }
        ),
        averageUtilization:
          allPositions
            .filter(p => p.utilizationRate !== undefined)
            .reduce((sum, p) => sum + (p.utilizationRate || 0), 0) /
            allPositions.filter(p => p.utilizationRate !== undefined).length || 0,
        dataSource: 'Camelot v3 Subgraph (Direct GraphQL)',
      };

      // Create artifacts for the positions and summary
      const artifacts = [
        {
          artifactId: 'wallet-positions-summary',
          parts: [
            {
              kind: 'text' as const,
              text: JSON.stringify(summary, null, 2),
            },
          ],
        },
        {
          artifactId: 'wallet-positions-detailed',
          parts: [
            {
              kind: 'text' as const,
              text: JSON.stringify(allPositions, null, 2),
            },
          ],
        },
      ];

      return createSuccessTask(
        'fetchWalletPositions',
        artifacts,
        `Found ${allPositions.length} active LP positions using direct GraphQL. ${summary.inRangePositions} in range, ${summary.outOfRangePositions} out of range.`
      );
    } catch (error) {
      console.error('❌ Error fetching wallet positions:', error);
      const vibkitError = error instanceof Error ? error : new Error('Unknown error');
      return createErrorTask('fetchWalletPositions', vibkitError);
    }
  },
};
