/**
 * getUserPositions Tool
 * 
 * Fetches user position data from Ember MCP server including health factors,
 * supplied amounts, borrowed amounts, and liquidation risks.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';
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

      // Ensure we have MCP clients available
      if (!context.mcpClients) {
        throw new Error('MCP clients not available in context');
      }

      // Access Ember MCP client using standardized name
      const emberClient = context.mcpClients['ember-mcp-tool-server'];

      if (!emberClient) {
        throw new Error('Ember MCP client not found. Available clients: ' + Object.keys(context.mcpClients).join(', '));
      }

      // Call the Ember MCP server's getUserPositions tool
      const result = await emberClient.callTool({
        name: 'getUserPositions',
        arguments: {
          userAddress: args.userAddress,
        },
      });

      if (result.isError) {
        console.error('❌ Error calling getUserPositions:', result.content);
        let errorMessage = 'Unknown error';
        if (Array.isArray(result.content) && result.content[0]?.text) {
          errorMessage = result.content[0].text;
        }
        return createErrorTask(
          'get-user-positions',
          new Error(`Failed to fetch user positions: ${errorMessage}`)
        );
      }

      // Parse the response data
      let positionData: PositionData = {};
      try {
        const contentArray = Array.isArray(result.content) ? result.content : [];
        const responseText = contentArray.length > 0 && typeof contentArray[0]?.text === 'string'
          ? contentArray[0].text
          : undefined;
        if (responseText) {
          positionData = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.error('❌ Error parsing position data:', parseError);
        return createErrorTask(
          'get-user-positions',
          new Error('Failed to parse position data from Ember response')
        );
      }

      // Extract key metrics for monitoring
      const healthFactor = positionData.healthFactor;
      const totalSupplied = positionData.totalSuppliedUsd || 0;
      const totalBorrowed = positionData.totalBorrowedUsd || 0;
      const positions = positionData.positions || [];

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
        ...positions.map(pos => 
          `• ${pos.tokenSymbol}: Supplied: ${pos.suppliedAmount || 0}, Borrowed: ${pos.borrowedAmount || 0}`
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
