/**
 * getWalletBalances Tool
 * 
 * Fetches wallet token balances from Ember MCP server and analyzes them 
 * for liquidation prevention strategies.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { GetWalletBalancesResponseSchema } from 'ember-schemas';
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

      // Access Ember MCP client from custom context
      const emberClient = context.custom.mcpClient;
 

      let toolsResponse = await emberClient.listTools();
      console.log("toolsResponse........:", toolsResponse);

      // Call the Ember MCP server's getWalletBalances tool with correct parameter name
      const result = await emberClient.callTool({
        name: 'getWalletBalances',
        arguments: {
          walletAddress: args.walletAddress!,
        },
      });
      

      console.log('💰 getWalletBalances result........:', result);
      // Parse the response using proper schema validation
      const balanceData = parseMcpToolResponsePayload(result, GetWalletBalancesResponseSchema);

      const balances = balanceData.balances || [];
      const totalBalanceUsd = balances.reduce((sum, balance) => sum + (balance.valueUsd || 0), 0);

      // Analyze balances for liquidation prevention strategies
      const collateralTokens = balances.filter(token => 
        ['USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'WBTC'].includes(token.symbol.toUpperCase())
      );

      const stablecoins = balances.filter(token => 
        ['USDC', 'USDT', 'DAI'].includes(token.symbol.toUpperCase())
      );

      // Strategy recommendations
      const strategies = [];
      
      if (collateralTokens.length > 0) {
        const totalCollateralValue = collateralTokens.reduce((sum, token) => sum + (token.valueUsd || 0), 0);
        strategies.push(`💪 Supply collateral: $${totalCollateralValue.toLocaleString()} available in quality collateral tokens`);
      }

      if (stablecoins.length > 0) {
        const totalStableValue = stablecoins.reduce((sum, token) => sum + (token.valueUsd || 0), 0);
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
          `• ${token.symbol}: ${token.amount} ($${(token.valueUsd || 0).toLocaleString()})`
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
