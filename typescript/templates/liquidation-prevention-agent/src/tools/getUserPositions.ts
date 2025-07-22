/**
 * getUserPositions Tool
 * 
 * Fetches user position data from Ember MCP server including health factors,
 * supplied amounts, borrowed amounts, and liquidation risks.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { GetWalletLendingPositionsResponseSchema } from 'ember-schemas';
import type { LiquidationPreventionContext } from '../context/types.js';

// Input schema for getUserPositions tool
const GetUserPositionsParams = z.object({
  userAddress: z.string().describe('The wallet address to fetch positions for'),
});

// Define types for the response structure
interface PositionData {
  healthFactor?: number;
  totalSuppliedUsd?: number;
  totalBorrowedUsd?: number;
  positions?: Array<{
    tokenSymbol: string;
    tokenAddress: string;
    chainId: string;
    suppliedAmount?: number;
    borrowedAmount?: number;
    supplyApy?: number;
    borrowApy?: number;
    isCollateral?: boolean;
  }>;
}

// getUserPositions tool implementation
export const getUserPositionsTool: VibkitToolDefinition<typeof GetUserPositionsParams, any, LiquidationPreventionContext, any> = {
  name: 'get-user-positions',
  description: 'Fetch user lending positions and health factor from Aave via Ember MCP server',
  parameters: GetUserPositionsParams,
  execute: async (args, context) => {
    try {
      console.log(`🔍 Fetching positions for user: ${args.userAddress}`);

      // Access Ember MCP client from custom context
      const emberClient = context.custom.mcpClient;

      // Call the Ember MCP server's getWalletLendingPositions tool (correct name)
      const result = await emberClient.callTool({
        name: 'getWalletLendingPositions',
        arguments: {
          walletAddress: args.userAddress,
        },
      });

      console.log("result........:", result);

      // Parse the response using proper schema validation
      const positionData = parseMcpToolResponsePayload(result, GetWalletLendingPositionsResponseSchema);
      console.log("positionData........:", positionData);

      // Extract key metrics for monitoring from the standardized response
      // Note: The response structure is { positions: [...] } where each position has healthFactor
      const positions = positionData.positions || [];
      const firstPosition = positions[0];
      const healthFactor = firstPosition?.healthFactor ? parseFloat(firstPosition.healthFactor) : undefined;
      const totalSupplied = firstPosition?.totalCollateralUsd ? parseFloat(firstPosition.totalCollateralUsd) : 0;
      const totalBorrowed = firstPosition?.totalBorrowsUsd ? parseFloat(firstPosition.totalBorrowsUsd) : 0;

      // export const TokenSchema = z.object({
      //   tokenUid: TokenIdentifierSchema.describe("Unique identifier for the token, if it's not a native token."),
      //   name: z.string().describe("Full name of the token, e.g., 'Ethereum'."),
      //   symbol: z.string().describe("Symbol of the token, e.g., 'ETH'."),
      //   isNative: z.boolean().describe("Whether this is the native token of the chain."),
      //   decimals: z.number().describe("Number of decimal places the token uses."),
      //   iconUri: z.string().optional().describe("URI for the token's icon."),
      //   usdPrice: z.string().optional().describe("Current USD price of the token, as a string to maintain precision."),
      //   isVetted: z.boolean().describe("Whether this token is considered vetted or trusted."),
      // });

      // console all values of token like symbol, name, isNative, decimals, iconUri, usdPrice, isVetted
      positions.flatMap(pos => 
        pos.userReserves.map(reserve => 
          console.log("reserve........:", reserve.token)
          // console.log("reserve........:", reserve.token.symbol, reserve.token.name, reserve.token.isNative, reserve.token.decimals, reserve.token.iconUri, reserve.token.usdPrice, reserve.token.isVetted)
        )
      );

      // Determine risk level based on health factor
      let riskLevel = 'SAFE';
      let riskColor = '🟢';
      
      if (healthFactor !== undefined) {
        if (healthFactor <= context.custom.thresholds.critical) {
          riskLevel = 'CRITICAL';
          riskColor = '🔴';
        } else if (healthFactor <= context.custom.thresholds.danger) {
          riskLevel = 'DANGER';
          riskColor = '🟠';
        } else if (healthFactor <= context.custom.thresholds.warning) {
          riskLevel = 'WARNING';
          riskColor = '🟡';
        }
      }

      const summary = {
        userAddress: args.userAddress,
        healthFactor,
        riskLevel,
        totalSuppliedUsd: totalSupplied,
        totalBorrowedUsd: totalBorrowed,
        positionCount: positions.length,
        timestamp: new Date().toISOString(),
      };

      // Create detailed response
      const message = [
        `${riskColor} **Position Summary for ${args.userAddress}**`,
        ``,
        `📊 **Health Factor:** ${healthFactor ? healthFactor.toFixed(4) : 'N/A'}`,
        `⚠️  **Risk Level:** ${riskLevel}`,
        `💰 **Total Supplied:** $${totalSupplied.toLocaleString()}`,
        `💸 **Total Borrowed:** $${totalBorrowed.toLocaleString()}`,
        `📈 **Active Positions:** ${positions.length}`,
        ``,
        positions.length > 0 ? `**Position Details:**` : '',
                 ...positions.flatMap(pos => 
           pos.userReserves.map(reserve => 
             `• ${reserve.token.symbol}: Supplied: ${reserve.underlyingBalance}, Borrowed: ${reserve.variableBorrows}`
           )
        ),
        ``,
        `🕐 **Last Updated:** ${new Date().toLocaleString()}`,
      ].filter(line => line !== '').join('\n');

      console.log(`✅ Successfully fetched positions. Health Factor: ${healthFactor}, Risk: ${riskLevel}`);

      return createSuccessTask(
        'get-user-positions',
        undefined, // No artifacts for now, keep it simple
        `📊 Position Analysis: ${positions.length} positions found. Health Factor: ${healthFactor?.toFixed(4) || 'N/A'}, Risk Level: ${riskLevel}. ${message}`
      );

    } catch (error) {
      console.error('❌ getUserPositions tool error:', error);
      return createErrorTask(
        'get-user-positions',
        error instanceof Error ? error : new Error(`Failed to fetch user positions: ${error}`)
      );
    }
  },
}; 
