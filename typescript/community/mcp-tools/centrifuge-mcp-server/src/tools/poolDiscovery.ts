import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';
import { PoolDiscoveryInputSchema, type PoolInfo } from '../types/centrifuge.js';

export const discoverCentrifugePoolsTool: Tool = {
    name: 'discover-centrifuge-pools',
    description: 'Discover and analyze Centrifuge RWA investment pools with real-time data from the Centrifuge SDK',
    inputSchema: {
        type: 'object',
        properties: {
            assetTypes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by asset types (e.g., "Real Estate", "Infrastructure", "Invoices")',
                default: []
            },
            minYield: {
                type: 'number',
                description: 'Minimum yield percentage (APY)',
                default: 0
            },
            maxRisk: {
                type: 'number',
                description: 'Maximum risk score (0-100)',
                default: 100
            },
            minLiquidity: {
                type: 'number',
                description: 'Minimum liquidity score (0-100)',
                default: 0
            },
            networks: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by networks (e.g., "arbitrum", "ethereum")',
                default: []
            },
            limit: {
                type: 'number',
                description: 'Maximum number of pools to return',
                default: 20,
                minimum: 1,
                maximum: 50
            }
        }
    }
};

export async function executeDiscoverCentrifugePools(args: any): Promise<{ content: string }> {
    try {
        // console.log('🚀 [discoverCentrifugePools] STARTING tool execution');
        // console.log('📥 [discoverCentrifugePools] Input args:', JSON.stringify(args, null, 2));

        // Validate input
        const validatedArgs = PoolDiscoveryInputSchema.parse(args);
        // console.log('✅ [discoverCentrifugePools] Input validation passed');

        // Initialize Centrifuge SDK client
        const sdkClient = new CentrifugeSDKClient({
            environment: 'mainnet',
            rpcUrls: {
                1: 'http://127.0.0.1:8545', // Local anvil fork
                42161: 'https://arb1.arbitrum.io/rpc', // Arbitrum RPC
            },
            indexerUrl: 'https://indexer.centrifuge.io',
            ipfsUrl: 'https://ipfs.centrifuge.io',
        });

        // Fetch all pools
        const pools = await sdkClient.getAllPools();
        // console.log(`📊 [discoverCentrifugePools] Found ${pools.length} pools from SDK`);

        // Transform real pools from SDK to our format
        const transformedPools: PoolInfo[] = [];

        // Transform real SDK pools to our format
        for (const pool of pools) {
            try {
                // Extract basic pool information
                const poolInfo: PoolInfo = {
                    id: pool.id?.toString() || 'unknown',
                    name: pool.name || `Pool ${pool.id}`,
                    description: pool.metadata?.description || 'Centrifuge investment pool',
                    assetType: pool.assetType || 'Unknown',
                    currentYield: pool.currentYield || '0',
                    riskScore: pool.riskScore || 50,
                    liquidityScore: pool.liquidityScore || 50,
                    totalValueLocked: pool.totalValueLocked || '0',
                    minimumInvestment: pool.minimumInvestment || '0',
                    activeNetworks: pool.activeNetworks || ['ethereum'],
                    tranches: pool.tranches || [],
                    vaults: pool.vaults || [],
                    metadata: pool.metadata || {
                        website: 'https://centrifuge.io',
                        documentation: 'https://docs.centrifuge.io',
                        legal: 'https://centrifuge.io/legal'
                    }
                };
                transformedPools.push(poolInfo);
            } catch (error) {
                console.warn(`⚠️ Failed to transform pool ${pool.id}:`, error);
            }
        }

        // Apply filters
        let filteredPools = transformedPools;

        if (validatedArgs.assetTypes && validatedArgs.assetTypes.length > 0) {
            filteredPools = filteredPools.filter(pool =>
                validatedArgs.assetTypes!.some(type =>
                    pool.assetType.toLowerCase().includes(type.toLowerCase())
                )
            );
        }

        if (validatedArgs.minYield !== undefined) {
            filteredPools = filteredPools.filter(pool =>
                parseFloat(pool.currentYield) >= validatedArgs.minYield!
            );
        }

        if (validatedArgs.maxRisk !== undefined) {
            filteredPools = filteredPools.filter(pool =>
                pool.riskScore <= validatedArgs.maxRisk!
            );
        }

        if (validatedArgs.minLiquidity !== undefined) {
            filteredPools = filteredPools.filter(pool =>
                pool.liquidityScore >= validatedArgs.minLiquidity!
            );
        }

        if (validatedArgs.networks && validatedArgs.networks.length > 0) {
            filteredPools = filteredPools.filter(pool =>
                pool.activeNetworks.some(network =>
                    validatedArgs.networks!.some(filterNetwork =>
                        network.toLowerCase().includes(filterNetwork.toLowerCase())
                    )
                )
            );
        }

        // Apply limit
        filteredPools = filteredPools.slice(0, validatedArgs.limit);

        // console.log(`✅ [discoverCentrifugePools] Found ${filteredPools.length} pools matching filters`);

        // Create detailed response
        let response = `🔍 **CENTRIFUGE POOL DISCOVERY RESULTS**\n\n`;
        response += `📊 **SUMMARY:**\n`;
        response += `• Total pools found: ${filteredPools.length}\n`;
        response += `• Filters applied: ${JSON.stringify(validatedArgs)}\n`;
        response += `• Data source: Centrifuge SDK (Real-time)\n\n`;

        if (filteredPools.length === 0) {
            response += `❌ **No pools found matching your criteria.**\n`;
            response += `Try adjusting your filters or expanding your search criteria.\n`;
        } else {
            response += `🎯 **AVAILABLE POOLS:**\n\n`;

            filteredPools.forEach((pool, index) => {
                response += `**${index + 1}. ${pool.name}**\n`;
                response += `• **Pool ID:** ${pool.id}\n`;
                response += `• **Asset Type:** ${pool.assetType}\n`;
                response += `• **Current Yield:** ${pool.currentYield}% APY\n`;
                response += `• **Risk Score:** ${pool.riskScore}/100\n`;
                response += `• **Liquidity Score:** ${pool.liquidityScore}/100\n`;
                response += `• **Total Value Locked:** $${pool.totalValueLocked}\n`;
                response += `• **Minimum Investment:** $${pool.minimumInvestment}\n`;
                response += `• **Active Networks:** ${pool.activeNetworks.join(', ')}\n`;

                if (pool.tranches && pool.tranches.length > 0) {
                    response += `• **Available Tranches:**\n`;
                    pool.tranches.forEach(tranche => {
                        response += `  - ${tranche.name}: ${tranche.apy}% APY (${tranche.riskLevel} risk)\n`;
                    });
                }

                if (pool.vaults && pool.vaults.length > 0) {
                    response += `• **Available Vaults:**\n`;
                    pool.vaults.forEach(vault => {
                        response += `  - ${vault.network}: ${vault.currency} (${vault.isActive ? 'Active' : 'Inactive'})\n`;
                    });
                }

                response += `\n`;
            });

            // Add top recommendations
            const topPools = filteredPools
                .sort((a, b) => parseFloat(b.currentYield) - parseFloat(a.currentYield))
                .slice(0, 3);

            response += `🏆 **TOP RECOMMENDATIONS:**\n`;
            topPools.forEach((pool, index) => {
                response += `${index + 1}. **${pool.name}** - ${pool.currentYield}% yield, ${pool.riskScore} risk score\n`;
            });

            response += `\n💡 **NEXT STEPS:**\n`;
            response += `• Use \`analyze-pool-details\` to get detailed information about a specific pool\n`;
            response += `• Use \`get-investment-status\` to check your current investments\n`;
            response += `• Use \`place-investment-order\` to invest in a pool\n`;
        }

        response += `\n⏰ **Data updated:** ${new Date().toISOString()}`;

        // console.log('✅ [discoverCentrifugePools] Tool execution completed successfully');
        return { content: response };

    } catch (error) {
        // console.error('❌ [discoverCentrifugePools] Tool execution failed:', error);

        let errorResponse = `❌ **CENTRIFUGE POOL DISCOVERY FAILED**\n\n`;
        errorResponse += `**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n`;
        errorResponse += `**Troubleshooting:**\n`;
        errorResponse += `• Check your internet connection\n`;
        errorResponse += `• Verify RPC endpoints are accessible\n`;
        errorResponse += `• Ensure Centrifuge SDK is properly configured\n`;
        errorResponse += `• Try again in a few moments\n\n`;
        errorResponse += `**Timestamp:** ${new Date().toISOString()}`;

        return { content: errorResponse };
    }
}
