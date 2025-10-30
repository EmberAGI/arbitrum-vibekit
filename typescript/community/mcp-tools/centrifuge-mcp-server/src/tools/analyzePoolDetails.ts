import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';
import type { PoolInfo } from '../types/centrifuge.js';

export const analyzePoolDetailsTool: Tool = {
    name: 'analyze-pool-details',
    description: 'Get detailed analysis and metrics for a specific Centrifuge RWA investment pool',
    inputSchema: {
        type: 'object',
        properties: {
            poolId: {
                type: 'string',
                description: 'The ID of the pool to analyze',
                pattern: '^[0-9]+$'
            },
            includeRiskMetrics: {
                type: 'boolean',
                description: 'Whether to include detailed risk metrics and analysis',
                default: true
            },
            includeHistoricalData: {
                type: 'boolean',
                description: 'Whether to include historical performance data',
                default: false
            },
            includeTrancheDetails: {
                type: 'boolean',
                description: 'Whether to include detailed tranche analysis',
                default: true
            }
        },
        required: ['poolId']
    }
};

export async function executeAnalyzePoolDetails(args: any): Promise<{ content: string }> {
    const { poolId, includeRiskMetrics = true, includeHistoricalData = false, includeTrancheDetails = true } = args;

    try {
        // console.log(`🔍 [Analyze Pool Details] Analyzing pool ${poolId}...`);

        const sdkClient = new CentrifugeSDKClient({
            environment: 'mainnet',
            rpcUrls: {
                1: 'http://127.0.0.1:8545', // Local anvil fork
                42161: 'https://arb1.arbitrum.io/rpc', // Arbitrum RPC
            },
            indexerUrl: 'https://indexer.centrifuge.io',
            ipfsUrl: 'https://ipfs.centrifuge.io',
        });
        const pools = await sdkClient.getAllPools();

        // Get real pool data from SDK
        let poolDetails: any = null;

        try {
            // Try to get the specific pool from SDK
            poolDetails = await sdkClient.getPool(poolId);
        } catch (error) {
            console.warn(`⚠️ Pool ${poolId} not found in SDK, trying from pools list...`);

            // If specific pool not found, try to find it in the pools list
            for (const pool of pools) {
                if (pool.id?.toString() === poolId) {
                    poolDetails = pool;
                    break;
                }
            }
        }

        if (!poolDetails) {
            throw new Error(`Pool ${poolId} not found`);
        }

        // Transform real SDK pool data to our format
        const detailedPool: any = {
            id: poolId,
            name: poolDetails.name || `Pool ${poolId}`,
            description: poolDetails.metadata?.description || 'Centrifuge investment pool',
            assetType: poolDetails.assetType || 'Unknown',
            currentYield: poolDetails.currentYield || '0%',
            riskScore: poolDetails.riskScore || 50,
            liquidityScore: poolDetails.liquidityScore || 50,
            totalValueLocked: poolDetails.totalValueLocked || '$0',
            minimumInvestment: poolDetails.minimumInvestment || '$0',
            activeNetworks: poolDetails.activeNetworks || ['ethereum'],
            tranches: poolDetails.tranches || [],
            vaults: poolDetails.vaults || [],
            riskMetrics: includeRiskMetrics ? {
                volatilityIndex: 'Unknown',
                creditScore: 'Unknown',
                diversificationScore: 'Unknown',
                geographicSpread: 'Unknown',
                assetQuality: 'Unknown',
                defaultHistory: 'Unknown',
                recoveryRate: 'Unknown'
            } : undefined,
            historicalData: includeHistoricalData ? {} : undefined,
            metadata: poolDetails.metadata || {
                website: 'https://centrifuge.io',
                documentation: 'https://docs.centrifuge.io',
                legal: 'https://centrifuge.io/legal'
            }
        };

        let response = `🔬 **CENTRIFUGE POOL DETAILED ANALYSIS**

📊 **POOL OVERVIEW:**
• **Pool ID:** ${detailedPool.id}
• **Name:** ${detailedPool.name}
• **Description:** ${detailedPool.description}
• **Asset Type:** ${detailedPool.assetType}
• **Current Yield:** ${detailedPool.currentYield} APY
• **Risk Score:** ${detailedPool.riskScore}/100
• **Liquidity Score:** ${detailedPool.liquidityScore}/100
• **Total Value Locked:** ${detailedPool.totalValueLocked}
• **Minimum Investment:** ${detailedPool.minimumInvestment}
• **Active Networks:** ${detailedPool.activeNetworks.join(', ')}

`;

        if (includeTrancheDetails && poolDetails.tranches) {
            response += `🏦 **TRANCHE ANALYSIS:**

`;
            poolDetails.tranches.forEach((tranche: any, index: number) => {
                response += `**${index + 1}. ${tranche.name}**
• **Type:** ${tranche.type}
• **Current APY:** ${tranche.apy}
• **Risk Level:** ${tranche.riskLevel}
• **Total Invested:** ${tranche.totalInvested}
• **Max Capacity:** ${tranche.maxCapacity}
• **Utilization:** ${tranche.currentUtilization}

`;
            });
        }

        if (includeRiskMetrics && poolDetails.riskMetrics) {
            response += `📈 **RISK METRICS:**

• **Volatility Index:** ${poolDetails.riskMetrics.volatilityIndex}
• **Credit Score:** ${poolDetails.riskMetrics.creditScore}
• **Diversification Score:** ${poolDetails.riskMetrics.diversificationScore}
• **Geographic Spread:** ${poolDetails.riskMetrics.geographicSpread}
• **Asset Quality:** ${poolDetails.riskMetrics.assetQuality}
• **Default History:** ${poolDetails.riskMetrics.defaultHistory}
• **Recovery Rate:** ${poolDetails.riskMetrics.recoveryRate}

`;
        }

        if (includeHistoricalData && poolDetails.historicalData) {
            response += `📅 **HISTORICAL PERFORMANCE:**

**30 Days:**
• Average Yield: ${poolDetails.historicalData['30d'].yield}
• TVL: ${poolDetails.historicalData['30d'].tvl}
• Active Investors: ${poolDetails.historicalData['30d'].investors}
• Transactions: ${poolDetails.historicalData['30d'].transactions}

**90 Days:**
• Average Yield: ${poolDetails.historicalData['90d'].yield}
• TVL: ${poolDetails.historicalData['90d'].tvl}
• Active Investors: ${poolDetails.historicalData['90d'].investors}
• Transactions: ${poolDetails.historicalData['90d'].transactions}

**1 Year:**
• Average Yield: ${poolDetails.historicalData['1y'].yield}
• TVL: ${poolDetails.historicalData['1y'].tvl}
• Active Investors: ${poolDetails.historicalData['1y'].investors}
• Transactions: ${poolDetails.historicalData['1y'].transactions}

`;
        }

        response += `🏛️ **VAULT INFORMATION:**

`;
        poolDetails.vaults.forEach((vault: any, index: number) => {
            response += `**${index + 1}. ${vault.network.toUpperCase()} - ${vault.currency}**
• **Address:** ${vault.address}
• **Status:** ${vault.isActive ? 'Active' : 'Inactive'}
• **Total Liquidity:** ${vault.totalLiquidity}
• **Utilization Rate:** ${vault.utilizationRate}

`;
        });

        response += `📋 **POOL METADATA:**

• **Website:** ${poolDetails.metadata.website}
• **Documentation:** ${poolDetails.metadata.documentation}
• **Legal Terms:** ${poolDetails.metadata.legal}

💡 **NEXT STEPS:**
• Use \`get-investment-status\` to check your current investments
• Use \`place-investment-order\` to invest in this pool
• Use \`discover-centrifuge-pools\` to compare with other pools

⏰ **Data updated:** ${new Date().toISOString()}`;

        // console.log(`✅ [Analyze Pool Details] Successfully analyzed pool ${poolId}`);
        return { content: response };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        // console.error(`❌ [Analyze Pool Details] Failed:`, errorMessage);

        return {
            content: `❌ **POOL ANALYSIS FAILED**

**Error:** ${errorMessage}

**Pool ID:** ${poolId}

**Troubleshooting:**
• Verify the pool ID exists
• Check your internet connection
• Try again in a few minutes

**Next Steps:**
• Use \`discover-centrifuge-pools\` to see available pools
• Contact support if the issue persists

⏰ **Error occurred:** ${new Date().toISOString()}`
        };
    }
}
