import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CentrifugeSDKClient } from '../utils/sdkClient.js';
import { InvestmentStatusSchema, type InvestmentStatus } from '../types/centrifuge.js';

export const getInvestmentStatusTool: Tool = {
    name: 'get-investment-status',
    description: 'Get current investment status and positions for an investor across all Centrifuge pools',
    inputSchema: {
        type: 'object',
        properties: {
            investorAddress: {
                type: 'string',
                description: 'The investor\'s wallet address to check investments for',
                pattern: '^0x[a-fA-F0-9]{40}$'
            },
            poolId: {
                type: 'string',
                description: 'Optional: Specific pool ID to check (if not provided, checks all pools)',
                default: ''
            },
            network: {
                type: 'string',
                description: 'Optional: Specific network to check (e.g., "arbitrum", "ethereum")',
                default: ''
            },
            includeHistory: {
                type: 'boolean',
                description: 'Whether to include investment history and transaction details',
                default: false
            }
        },
        required: ['investorAddress']
    }
};

export async function executeGetInvestmentStatus(args: any): Promise<{ content: string }> {
    try {
        // console.log('🚀 [getInvestmentStatus] STARTING tool execution');
        // console.log('📥 [getInvestmentStatus] Input args:', JSON.stringify(args, null, 2));

        // Validate input
        const validatedArgs = z.object({
            investorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format'),
            poolId: z.string().optional(),
            network: z.string().optional(),
            includeHistory: z.boolean().default(false)
        }).parse(args);

        // console.log('✅ [getInvestmentStatus] Input validation passed');

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

        // Get real investment data from SDK
        const investments: InvestmentStatus[] = [];

        try {
            // Get all pools first
            const pools = await sdkClient.getAllPools();

            // For each pool, try to get investment status for the investor
            for (const pool of pools) {
                try {
                    const poolId = pool.id?.toString();
                    if (!poolId) continue;

                    // Try to get investment status for this pool
                    // Note: This might fail if the investor has no position in this pool
                    const vault = pool.vaults?.[0]; // Get first vault
                    if (vault) {
                        try {
                            const investmentStatus = await sdkClient.getInvestmentStatus(vault, validatedArgs.investorAddress);
                            if (investmentStatus) {
                                investments.push({
                                    investorAddress: validatedArgs.investorAddress,
                                    poolId: poolId,
                                    trancheId: vault.trancheId || 'unknown',
                                    network: vault.network || 'ethereum',
                                    currency: vault.currency || 'USDC',
                                    totalInvested: investmentStatus.totalInvested || '0',
                                    currentValue: investmentStatus.currentValue || '0',
                                    pendingOrders: investmentStatus.pendingOrders || [],
                                    claimableTokens: investmentStatus.claimableTokens || '0',
                                    lastUpdated: new Date().toISOString()
                                });
                            }
                        } catch (error) {
                            // Skip pools where investor has no position
                            // console.log(`⚠️ No investment found for pool ${poolId}`);
                        }
                    }
                } catch (error) {
                    // console.warn(`⚠️ Failed to get investment for pool ${pool.id}:`, error);
                }
            }
        } catch (error) {
            // console.error('❌ Failed to fetch investments from SDK:', error);
            throw new Error(`Failed to fetch investment data: ${error.message}`);
        }

        // Filter investments based on criteria
        let filteredInvestments = investments;

        if (validatedArgs.poolId) {
            filteredInvestments = filteredInvestments.filter(inv => inv.poolId === validatedArgs.poolId);
        }

        if (validatedArgs.network) {
            filteredInvestments = filteredInvestments.filter(inv =>
                inv.network.toLowerCase().includes(validatedArgs.network!.toLowerCase())
            );
        }

        // console.log(`📊 [getInvestmentStatus] Found ${filteredInvestments.length} investments`);

        // Create detailed response
        let response = `📊 **INVESTMENT STATUS REPORT**\n\n`;
        response += `👤 **Investor:** ${validatedArgs.investorAddress}\n`;
        response += `📅 **Report Date:** ${new Date().toISOString()}\n`;
        response += `🔍 **Filters Applied:** ${JSON.stringify({
            poolId: validatedArgs.poolId || 'All pools',
            network: validatedArgs.network || 'All networks',
            includeHistory: validatedArgs.includeHistory
        })}\n\n`;

        if (filteredInvestments.length === 0) {
            response += `❌ **No investments found matching your criteria.**\n`;
            response += `Try adjusting your filters or check if you have any investments in Centrifuge pools.\n`;
        } else {
            // Calculate totals
            const totalInvested = filteredInvestments.reduce((sum, inv) =>
                sum + parseFloat(inv.totalInvested), 0
            );
            const totalCurrentValue = filteredInvestments.reduce((sum, inv) =>
                sum + parseFloat(inv.currentValue), 0
            );
            const totalClaimable = filteredInvestments.reduce((sum, inv) =>
                sum + parseFloat(inv.claimableTokens), 0
            );
            const totalPendingOrders = filteredInvestments.reduce((sum, inv) =>
                sum + inv.pendingOrders.length, 0
            );

            const totalReturn = totalCurrentValue - totalInvested;
            const totalReturnPercentage = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

            response += `💰 **PORTFOLIO SUMMARY:**\n`;
            response += `• Total Invested: $${totalInvested.toFixed(2)}\n`;
            response += `• Current Value: $${totalCurrentValue.toFixed(2)}\n`;
            response += `• Total Return: $${totalReturn.toFixed(2)} (${totalReturnPercentage.toFixed(2)}%)\n`;
            response += `• Claimable Tokens: $${totalClaimable.toFixed(2)}\n`;
            response += `• Pending Orders: ${totalPendingOrders}\n\n`;

            response += `🎯 **INVESTMENT DETAILS:**\n\n`;

            filteredInvestments.forEach((investment, index) => {
                const returnAmount = parseFloat(investment.currentValue) - parseFloat(investment.totalInvested);
                const returnPercentage = parseFloat(investment.totalInvested) > 0 ?
                    (returnAmount / parseFloat(investment.totalInvested)) * 100 : 0;

                response += `**${index + 1}. Pool ${investment.poolId} - ${investment.trancheId.toUpperCase()} Tranche**\n`;
                response += `• **Network:** ${investment.network}\n`;
                response += `• **Currency:** ${investment.currency}\n`;
                response += `• **Total Invested:** $${investment.totalInvested}\n`;
                response += `• **Current Value:** $${investment.currentValue}\n`;
                response += `• **Return:** $${returnAmount.toFixed(2)} (${returnPercentage.toFixed(2)}%)\n`;
                response += `• **Claimable:** $${investment.claimableTokens}\n`;
                response += `• **Last Updated:** ${investment.lastUpdated}\n`;

                if (investment.pendingOrders.length > 0) {
                    response += `• **Pending Orders:**\n`;
                    investment.pendingOrders.forEach(order => {
                        response += `  - ${order.type.toUpperCase()}: $${order.amount} (${order.status})\n`;
                    });
                } else {
                    response += `• **Pending Orders:** None\n`;
                }

                response += `\n`;
            });

            // Add recommendations
            if (totalClaimable > 0) {
                response += `💡 **RECOMMENDATIONS:**\n`;
                response += `• You have $${totalClaimable.toFixed(2)} in claimable tokens. Consider claiming them.\n`;
            }

            if (totalPendingOrders > 0) {
                response += `• You have ${totalPendingOrders} pending order(s). Monitor their status.\n`;
            }

            if (totalReturnPercentage > 0) {
                response += `• Your portfolio is performing well with a ${totalReturnPercentage.toFixed(2)}% return.\n`;
            }

            response += `\n📈 **NEXT STEPS:**\n`;
            response += `• Use \`place-investment-order\` to invest in additional pools\n`;
            response += `• Use \`place-redemption-order\` to redeem investments\n`;
            response += `• Use \`get-vault-info\` to get detailed vault information\n`;
        }

        response += `\n⏰ **Data updated:** ${new Date().toISOString()}`;

        // console.log('✅ [getInvestmentStatus] Tool execution completed successfully');
        return { content: response };

    } catch (error) {
        // console.error('❌ [getInvestmentStatus] Tool execution failed:', error);

        let errorResponse = `❌ **INVESTMENT STATUS CHECK FAILED**\n\n`;
        errorResponse += `**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n`;
        errorResponse += `**Troubleshooting:**\n`;
        errorResponse += `• Verify the investor address is a valid Ethereum address\n`;
        errorResponse += `• Check your internet connection\n`;
        errorResponse += `• Ensure Centrifuge SDK is properly configured\n`;
        errorResponse += `• Try again in a few moments\n\n`;
        errorResponse += `**Timestamp:** ${new Date().toISOString()}`;

        return { content: errorResponse };
    }
}
