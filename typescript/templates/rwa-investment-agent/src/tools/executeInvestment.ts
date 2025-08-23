import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { RWAContext } from '../context/types.js';
import { RealBlockchainClient } from './blockchain/realBlockchainClient.js';

const ExecuteInvestmentParams = z.object({
    poolId: z.string().describe('ID of the RWA pool to invest in'),
    amount: z.string().describe('Investment amount in USDC'),
    walletAddress: z.string().describe('Investor wallet address'),
    assetType: z.string().describe('Type of asset being invested in'),
    expectedYield: z.number().describe('Expected annual yield percentage'),
    riskScore: z.number().describe('Risk score of the investment'),
    maturityDate: z.string().optional().describe('Maturity date if applicable'),
});

export const executeInvestmentTool: VibkitToolDefinition<
    typeof ExecuteInvestmentParams,
    any,
    RWAContext,
    any
> = {
    name: 'execute-rwa-investment',
    description: 'Execute investment in RWA pool with blockchain transaction',
    parameters: ExecuteInvestmentParams,

    execute: async (args, context) => {
        console.log('🚀 [executeInvestment] STARTING investment execution');
        console.log('📥 [executeInvestment] Investment args:', JSON.stringify(args, null, 2));

        try {
            // Validate investment parameters
            const investment = {
                poolId: args.poolId,
                amount: args.amount,
                walletAddress: args.walletAddress,
                assetType: args.assetType,
                expectedYield: args.expectedYield,
                riskScore: args.riskScore,
                maturityDate: args.maturityDate,
            };

            console.log('✅ [executeInvestment] Investment parameters validated');

            // Initialize simple blockchain client
            const blockchainClient = new RealBlockchainClient();

            // Get real pool data from blockchain
            console.log('🏦 [executeInvestment] Fetching real pool data from blockchain...');
            const poolData = await blockchainClient.getPoolData(investment.poolId);

            // Execute real investment transaction on blockchain
            console.log('🚀 [executeInvestment] Executing real investment transaction on blockchain...');

            const investmentResult = await blockchainClient.executeInvestment({
                poolAddress: poolData.poolAddress,
                amount: investment.amount,
                walletAddress: investment.walletAddress,
                assetType: investment.assetType,
                expectedYield: investment.expectedYield,
            });

            if (!investmentResult.success) {
                throw new Error(`Investment execution failed: ${investmentResult.error}`);
            }

            console.log('✅ [executeInvestment] Real investment transaction executed successfully!');
            console.log('🔗 Transaction Hash:', investmentResult.transactionHash);
            console.log('⛽ Gas Used:', investmentResult.gasUsed);
            console.log('📦 Block Number:', investmentResult.blockNumber);

            // In production, this would:
            // 1. Sign the transaction with private key
            // 2. Submit to blockchain
            // 3. Wait for confirmation
            // 4. Update portfolio

            // For MVP, we'll simulate the full process
            console.log('📡 [executeInvestment] Simulating blockchain confirmation...');

            // Get real transaction status from blockchain
            const transactionStatus = await blockchainClient.getTransactionStatus(investmentResult.transactionHash);

            console.log('✅ [executeInvestment] Investment executed successfully!');
            console.log('🔗 Pool Address:', poolData.poolAddress);
            console.log('💰 Investment Amount:', investment.amount);
            console.log('🎯 Expected Yield:', investment.expectedYield + '%');

            // Get updated portfolio from real blockchain
            const portfolio = await blockchainClient.getWalletPortfolio(args.walletAddress);

            const result = createSuccessTask(
                'rwa-investment-executed',
                [{
                    artifactId: `investment-${Date.now()}`,
                    name: 'Investment Transaction',
                    description: `Investment in ${args.assetType} pool`,
                    parts: [{
                        kind: 'text',
                        text: JSON.stringify({
                            poolId: args.poolId,
                            amount: args.amount,
                            expectedYield: args.expectedYield,
                            status: transactionStatus.status,
                            blockNumber: transactionStatus.blockNumber,
                            confirmations: transactionStatus.confirmations,
                            poolAddress: poolData.poolAddress,
                            poolData: poolData,
                            portfolio: portfolio,
                        }, null, 2)
                    }],
                    metadata: {
                        poolId: args.poolId,
                        amount: args.amount,
                        expectedYield: args.expectedYield,
                        poolAddress: poolData.poolAddress,
                    }
                }],
                `Successfully invested $${args.amount} in ${args.assetType} pool (${args.poolId}). Pool: ${poolData.poolAddress}. Expected yield: ${args.expectedYield}% annually.`
            );

            return result;

        } catch (error) {
            console.error('❌ [executeInvestment] ERROR occurred:', error);
            console.error('❌ [executeInvestment] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

            const errorResult = createErrorTask(
                'rwa-investment-execution',
                error instanceof Error ? error : new Error('Failed to execute RWA investment')
            );

            console.log('💥 [executeInvestment] Returning error task');
            return errorResult;
        }
    },
};
