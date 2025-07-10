/**
 * getWalletBalances Tool
 * 
 * Fetches wallet token balances from Ember MCP server and analyzes them 
 * for liquidation prevention strategies.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';

// Input schema for getWalletBalances tool - matching Ember MCP server exactly
const GetWalletBalancesParams = z.object({
  walletAddress: z.string().describe('The wallet address to fetch token balances for'),
});

// Define types for the response structure
interface TokenBalance {
  tokenSymbol: string;
  tokenAddress: string;
  chainId: string;
  balance: number;
  balanceUsd: number;
  decimals: number;
}

interface BalanceData {
  balances?: TokenBalance[];
  totalBalanceUsd?: number;
}

// getWalletBalances tool implementation
export const getWalletBalancesTool: VibkitToolDefinition<typeof GetWalletBalancesParams, any, LiquidationPreventionContext, any> = {
  name: 'get-wallet-balances',
  description: 'Fetch wallet token balances and analyze for liquidation prevention strategies',
  parameters: GetWalletBalancesParams,
  execute: async (args, context) => {
    try {
      console.log(`💰 Fetching wallet balances for: ${args.walletAddress}`);

      // Ensure we have MCP clients available
      if (!context.mcpClients) {
        throw new Error('MCP clients not available in context');
      }

      // Access Ember MCP client using standardized name
      const emberClient = context.mcpClients['ember-mcp-tool-server'];

      if (!emberClient) {
        throw new Error('Ember MCP client not found. Available clients: ' + Object.keys(context.mcpClients).join(', '));
      }

      // Call the Ember MCP server's getWalletBalances tool with correct parameter name
      const result = await emberClient.callTool({
        name: 'getWalletBalances',
        arguments: {
          walletAddress: args.walletAddress,  // Correct parameter name!
        },
      });

      if (result.isError) {
        console.error('❌ Error calling getWalletBalances:', result.content);
        let errorMessage = 'Unknown error';
        if (Array.isArray(result.content) && result.content[0]?.text) {
          errorMessage = result.content[0].text;
        }
        return createErrorTask(
          'get-wallet-balances',
          new Error(`Failed to fetch wallet balances: ${errorMessage}`)
        );
      }

      // Parse the response data
      let balanceData: BalanceData = {};
      try {
        const contentArray = Array.isArray(result.content) ? result.content : [];
        const responseText = contentArray.length > 0 && typeof contentArray[0]?.text === 'string'
          ? contentArray[0].text
          : undefined;
        if (responseText) {
          balanceData = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.error('❌ Error parsing balance data:', parseError);
        return createErrorTask(
          'get-wallet-balances',
          new Error('Failed to parse balance data from Ember response')
        );
      }

      const balances = balanceData.balances || [];
      const totalBalanceUsd = balanceData.totalBalanceUsd || 0;

      // Analyze balances for liquidation prevention strategies
      const collateralTokens = balances.filter(token => 
        ['USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'WBTC'].includes(token.tokenSymbol.toUpperCase())
      );

      const stablecoins = balances.filter(token => 
        ['USDC', 'USDT', 'DAI'].includes(token.tokenSymbol.toUpperCase())
      );

      // Strategy recommendations
      const strategies = [];
      
      if (collateralTokens.length > 0) {
        const totalCollateralValue = collateralTokens.reduce((sum, token) => sum + token.balanceUsd, 0);
        strategies.push(`💪 Supply collateral: $${totalCollateralValue.toLocaleString()} available in quality collateral tokens`);
      }

      if (stablecoins.length > 0) {
        const totalStableValue = stablecoins.reduce((sum, token) => sum + token.balanceUsd, 0);
        strategies.push(`💸 Repay debt: $${totalStableValue.toLocaleString()} available in stablecoins for debt repayment`);
      }

      if (strategies.length === 0) {
        strategies.push('⚠️ Limited options: Consider acquiring more assets or emergency liquidation');
      }

      // Create detailed response
      const message = [
        `💰 **Wallet Balance Analysis for ${args.walletAddress}**`,
        ``,
        `📊 **Total Balance:** $${totalBalanceUsd.toLocaleString()}`,
        `🪙 **Token Count:** ${balances.length}`,
        ``,
        `**Available Tokens:**`,
        ...balances.slice(0, 10).map(token => 
          `• ${token.tokenSymbol}: ${token.balance.toLocaleString()} ($${token.balanceUsd.toLocaleString()})`
        ),
        ...(balances.length > 10 ? [`... and ${balances.length - 10} more tokens`] : []),
        ``,
        `**Liquidation Prevention Strategies:**`,
        ...strategies.map(strategy => `• ${strategy}`),
        ``,
        `🕐 **Last Updated:** ${new Date().toLocaleString()}`,
      ].join('\n');

      console.log(`✅ Successfully fetched balances. Total: $${totalBalanceUsd}, Tokens: ${balances.length}`);

      return createSuccessTask(
        'get-wallet-balances',
        undefined, // No artifacts for now, keep it simple
        `💰 Balance Analysis: ${balances.length} tokens found worth $${totalBalanceUsd.toLocaleString()}. ${strategies.length} liquidation prevention strategies available. ${message}`
      );

    } catch (error) {
      console.error('❌ getWalletBalances tool error:', error);
      return createErrorTask(
        'get-wallet-balances',
        error instanceof Error ? error : new Error(`Failed to fetch wallet balances: ${error}`)
      );
    }
  },
}; 
