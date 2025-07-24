/**
 * testLiquidationData Tool
 * 
 * A dedicated tool to test and display the LiquidationPreventionData format
 * This is for testing purposes to see the structured data format
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { generateLiquidationPreventionData } from '../utils/liquidationData.js';

// Input schema for testLiquidationData tool
const TestLiquidationDataParams = z.object({
    userAddress: z.string().describe('The wallet address to analyze'),
    targetHealthFactor: z.string().optional().default("1.5").describe('Target health factor for analysis'),
});

// testLiquidationData tool implementation
export const testLiquidationDataTool: VibkitToolDefinition<typeof TestLiquidationDataParams, any, LiquidationPreventionContext, any> = {
    name: 'test-liquidation-data',
    description: 'Generate and display LiquidationPreventionData format for testing and verification',
    parameters: TestLiquidationDataParams,
    execute: async (args, context) => {
        try {
            console.log(`🧪 Testing LiquidationPreventionData generation for: ${args.userAddress}`);
            console.log(`🎯 Using target health factor: ${args.targetHealthFactor}`);

            // Generate the structured data
            const liquidationData = await generateLiquidationPreventionData(
                args.userAddress,
                context.custom,
                args.targetHealthFactor
            );

            // Format the data for display
            const suppliedAssets = liquidationData.assets.filter(a => a.type === "SUPPLIED");
            const borrowedAssets = liquidationData.assets.filter(a => a.type === "BORROWED");
            const walletAssets = liquidationData.assets.filter(a => a.type === "WALLET");

            // Create detailed response
            const message = [
                `🧠 **LiquidationPreventionData Analysis**`,
                ``,
                `👤 **User:** ${args.userAddress}`,
                `🎯 **Target Health Factor:** ${liquidationData.preventionConfig.targetHealthFactor}`,
                ``,
                `📊 **Position Summary:**`,
                `• Current Health Factor: ${liquidationData.positionSummary.currentHealthFactor}`,
                `• Total Collateral: $${parseFloat(liquidationData.positionSummary.totalCollateralUsd).toLocaleString()}`,
                `• Total Borrowed: $${parseFloat(liquidationData.positionSummary.totalBorrowsUsd).toLocaleString()}`,
                ``,
                `💰 **Supplied Assets (${suppliedAssets.length}):**`,
                ...suppliedAssets.map(asset =>
                    `• ${asset.symbol}: ${asset.balance} ($${parseFloat(asset.balanceUsd).toLocaleString()}) | LT: ${asset.liquidationThreshold}`
                ),
                ``,
                `📉 **Borrowed Assets (${borrowedAssets.length}):**`,
                ...borrowedAssets.map(asset =>
                    `• ${asset.symbol}: ${asset.balance} ($${parseFloat(asset.balanceUsd).toLocaleString()})`
                ),
                ``,
                `🏦 **Wallet Assets (${walletAssets.length}):**`,
                ...walletAssets.map(asset =>
                    `• ${asset.symbol}: ${asset.balance} ($${parseFloat(asset.balanceUsd).toLocaleString()}) | Supply: ${asset.canSupply ? '✅' : '❌'} | Repay: ${asset.canRepay ? '✅' : '❌'}`
                ),
                ``,
                `📋 **Summary:**`,
                `• Total Assets: ${liquidationData.assets.length}`,
                `• Data Structure: Ready for LLM analysis`,
                `• All liquidation thresholds fetched from Aave Protocol Data Provider`,
                `• All prices fetched from CoinGecko API`,
                `• All wallet balances fetched from on-chain contracts`,
                ``,
                `🕐 **Generated:** ${new Date().toLocaleString()}`,
            ].filter(line => line !== '').join('\n');

            // Also log the raw JSON structure for debugging
            console.log('\n📋 === RAW LIQUIDATION PREVENTION DATA ===');
            console.log(JSON.stringify(liquidationData, null, 2));
            console.log('📋 === END RAW DATA ===\n');

            return createSuccessTask(
                'test-liquidation-data',
                undefined,
                `🧪 LiquidationPreventionData generated successfully! Found ${liquidationData.assets.length} assets (${suppliedAssets.length} supplied, ${borrowedAssets.length} borrowed, ${walletAssets.length} wallet). Current HF: ${liquidationData.positionSummary.currentHealthFactor}, Target: ${liquidationData.preventionConfig.targetHealthFactor}. ${message}`
            );

        } catch (error) {
            console.error('❌ testLiquidationData tool error:', error);
            return createErrorTask(
                'test-liquidation-data',
                error instanceof Error ? error : new Error(`Failed to generate liquidation data: ${error}`)
            );
        }
    },
};
