import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { RWAContext } from '../context/types.js';
import { RealBlockchainClient } from './blockchain/realBlockchainClient.js';

const PortfolioQueryParams = z.object({
    walletAddress: z.string().describe('Wallet address to query portfolio for'),
    includeTransactions: z.boolean().optional().describe('Include transaction history'),
    includeYieldProjections: z.boolean().optional().describe('Include yield projections'),
});

export const portfolioManagerTool: VibkitToolDefinition<
    typeof PortfolioQueryParams,
    any,
    RWAContext,
    any
> = {
    name: 'rwa-portfolio-manager',
    description: 'Manage and track RWA investment portfolio with blockchain data',
    parameters: PortfolioQueryParams,

    execute: async (args, context) => {
        console.log('💰 [portfolioManager] STARTING portfolio query');
        console.log('📥 [portfolioManager] Query args:', JSON.stringify(args, null, 2));

        try {
            // Initialize simple blockchain client
            const blockchainClient = new RealBlockchainClient();

            // Get wallet portfolio from real blockchain
            console.log(`🔍 [portfolioManager] Fetching portfolio for wallet: ${args.walletAddress}`);
            const portfolio = await blockchainClient.getWalletPortfolio(args.walletAddress);

            // Calculate portfolio metrics
            const totalInvested = portfolio.rwaTokens.reduce((sum, token) => sum + Number(token.value), 0);
            const totalYield = portfolio.rwaTokens.reduce((sum, token) => sum + (Number(token.value) * token.yield / 100), 0);
            const averageYield = totalInvested > 0 ? (totalYield / totalInvested) * 100 : 0;

            // Mock transaction history (in production, this would query blockchain)
            const transactionHistory = args.includeTransactions ? [
                {
                    hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                    type: 'INVESTMENT',
                    poolId: 'pool-001',
                    amount: '10000',
                    timestamp: '2025-01-27T10:00:00Z',
                    status: 'CONFIRMED',
                    blockNumber: 50012345,
                },
                {
                    hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                    type: 'INVESTMENT',
                    poolId: 'pool-002',
                    amount: '5000',
                    timestamp: '2025-01-26T15:30:00Z',
                    status: 'CONFIRMED',
                    blockNumber: 50012300,
                },
            ] : [];

            // Mock yield projections (in production, this would calculate based on current yields)
            const yieldProjections = args.includeYieldProjections ? {
                monthly: totalYield / 12,
                quarterly: totalYield / 4,
                annual: totalYield,
                projectedValue: totalInvested + totalYield,
            } : null;

            const portfolioData = {
                walletAddress: args.walletAddress,
                totalBalance: portfolio.balance.toString(),
                totalInvested: totalInvested.toString(),
                totalValue: portfolio.totalValue.toString(),
                rwaTokens: portfolio.rwaTokens.map(token => ({
                    ...token,
                    balance: token.balance.toString(),
                    value: token.value.toString(),
                })),
                metrics: {
                    averageYield: averageYield.toFixed(2),
                    totalYield: totalYield.toFixed(2),
                    diversificationScore: portfolio.rwaTokens.length > 1 ? 'GOOD' : 'LOW',
                    riskScore: portfolio.rwaTokens.reduce((sum, token) => sum + (Number(token.value) * 0.6), 0) / totalInvested,
                },
                transactionHistory: args.includeTransactions ? transactionHistory : undefined,
                yieldProjections: yieldProjections,
                lastUpdated: new Date().toISOString(),
            };

            console.log('✅ [portfolioManager] Portfolio data compiled successfully');
            console.log(`💰 Total Value: $${portfolioData.totalValue}`);
            console.log(`📊 Average Yield: ${portfolioData.metrics.averageYield}%`);
            console.log(`🔄 RWA Tokens: ${portfolioData.rwaTokens.length}`);

            const result = createSuccessTask(
                'rwa-portfolio-query',
                [{
                    artifactId: `portfolio-${Date.now()}`,
                    name: 'Portfolio Data',
                    description: `Portfolio information for ${args.walletAddress}`,
                    parts: [{
                        kind: 'text',
                        text: JSON.stringify(portfolioData, null, 2)
                    }],
                    metadata: {
                        walletAddress: args.walletAddress,
                        totalValue: portfolioData.totalValue,
                        assetCount: portfolioData.rwaTokens.length,
                        averageYield: portfolioData.metrics.averageYield,
                    }
                }],
                `Portfolio for ${args.walletAddress}: Total value $${portfolioData.totalValue} with ${portfolioData.rwaTokens.length} RWA investments. Average yield: ${portfolioData.metrics.averageYield}% annually.`
            );

            return result;

        } catch (error) {
            console.error('❌ [portfolioManager] ERROR occurred:', error);
            console.error('❌ [portfolioManager] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

            const errorResult = createErrorTask(
                'rwa-portfolio-query',
                error instanceof Error ? error : new Error('Failed to query RWA portfolio')
            );

            console.log('💥 [portfolioManager] Returning error task');
            return errorResult;
        }
    },
};
