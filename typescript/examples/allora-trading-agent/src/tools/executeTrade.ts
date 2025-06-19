/**
 * Execute Trade Tool
 * Executes token swaps using Ember MCP
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createErrorTask, VibkitError } from 'arbitrum-vibekit-core';
import { getTokenInfo, SUPPORTED_CHAINS } from '../utils/tokenRegistry.js';

// Tool parameters schema
const ExecuteTradeParams = z.object({
  fromToken: z.string().describe('Token to swap from (e.g., USDC)'),
  toToken: z.string().describe('Token to swap to (e.g., ETH)'),
  amount: z.number().positive().describe('Amount of fromToken to swap (in token units, not USD)'),
  userAddress: z.string().describe('User wallet address'),
  chainId: z.string().optional().default(SUPPORTED_CHAINS.ARBITRUM).describe('Chain ID for the trade'),
  slippage: z.number().optional().default(1).describe('Maximum slippage percentage (default: 1%)'),
});

export const executeTradeTool: VibkitToolDefinition<typeof ExecuteTradeParams, any, any, any> = {
  name: 'execute-trade',
  description: 'Execute a token swap on-chain using Ember protocol',
  parameters: ExecuteTradeParams,

  execute: async (args, context) => {
    console.log('[ExecuteTrade] Executing with args:', args);

    const { fromToken, toToken, amount, userAddress, chainId, slippage } = args;

    // Get Ember MCP client
    const emberClient = context.mcpClients?.['ember-mcp-tool-server'];
    if (!emberClient) {
      return createErrorTask('execute-trade', new VibkitError('ClientError', -32603, 'Ember MCP client not available'));
    }

    try {
      // Get token addresses
      const fromTokenData = getTokenInfo(fromToken, chainId);
      const toTokenData = getTokenInfo(toToken, chainId);

      if (!fromTokenData || !toTokenData) {
        const missingToken = !fromTokenData ? fromToken : toToken;
        return createErrorTask(
          'execute-trade',
          new VibkitError(
            'TokenNotFoundError',
            -32602,
            `Token ${missingToken} not found on chain ${chainId}. Try using a different chain or token.`,
          ),
        );
      }

      console.log(`[ExecuteTrade] Swapping ${amount} ${fromToken} to ${toToken} on chain ${chainId}`);

      // Convert token amount to atomic units (wei/smallest unit)
      const atomicAmount = BigInt(Math.floor(amount * Math.pow(10, fromTokenData.decimals)));

      // Call Ember's swapTokens tool with correct parameter names
      const swapResponse = await emberClient.callTool({
        name: 'swapTokens',
        arguments: {
          fromTokenAddress: fromTokenData.address,
          fromTokenChainId: chainId,
          toTokenAddress: toTokenData.address,
          toTokenChainId: chainId,
          amount: atomicAmount.toString(),
          userAddress: userAddress,
        },
      });

      // Parse the response - Ember MCP returns structured data, not JSON text
      let swapData: any;
      if (swapResponse.content && Array.isArray(swapResponse.content) && swapResponse.content.length > 0) {
        const firstContent = swapResponse.content[0];
        if (firstContent.text) {
          // If it's JSON text, parse it
          try {
            swapData = JSON.parse(firstContent.text);
          } catch {
            // If parsing fails, treat as raw text/data
            swapData = firstContent;
          }
        } else {
          // Direct structured data
          swapData = firstContent;
        }
      }

      if (!swapData || !swapData.transactions) {
        console.error('[ExecuteTrade] Invalid swap response:', swapResponse);
        return createErrorTask(
          'execute-trade',
          new VibkitError('SwapError', -32603, 'Failed to generate swap transaction'),
        );
      }

      // Create transaction preview for the frontend
      const txPreview = {
        action: 'swap',
        fromToken: fromToken,
        toToken: toToken,
        amount: amount.toString(),
        chainId: chainId,
        chainName: getChainName(chainId),
        fromTokenAddress: fromTokenData.address,
        toTokenAddress: toTokenData.address,
        userAddress: userAddress,
      };

      // Extract transaction plan from Ember response
      const txPlan = swapData.transactions.map((tx: any) => ({
        to: tx.to,
        data: tx.data,
        value: tx.value || '0',
        chainId: chainId,
      }));

      // Return transaction artifact that the frontend can display with "Sign Transaction" buttons
      return {
        id: userAddress,
        status: {
          state: 'completed' as const,
          message: {
            role: 'agent' as const,
            parts: [
              {
                type: 'text' as const,
                text: `✅ **Trade Ready for Execution**\n\nSwapping ${amount} ${fromToken} to ${toToken} on ${getChainName(chainId)}.\n\n🔐 **Ready to sign** - Click the "Sign Transaction" button below to execute this trade.`,
              },
            ],
          },
        },
        artifacts: [
          {
            name: 'transaction-plan',
            parts: [
              {
                type: 'data' as const,
                data: {
                  txPreview,
                  txPlan,
                },
              },
            ],
          },
        ],
      };
    } catch (error) {
      console.error('[ExecuteTrade] Error:', error);
      return createErrorTask(
        'execute-trade',
        new VibkitError(
          'ExecutionError',
          -32603,
          `Failed to execute trade: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  },
};

// Helper function to get chain name
function getChainName(chainId: string): string {
  const chains: Record<string, string> = {
    [SUPPORTED_CHAINS.ARBITRUM]: 'Arbitrum',
    [SUPPORTED_CHAINS.ETHEREUM]: 'Ethereum',
    [SUPPORTED_CHAINS.BASE]: 'Base',
    [SUPPORTED_CHAINS.OPTIMISM]: 'Optimism',
    [SUPPORTED_CHAINS.POLYGON]: 'Polygon',
  };
  return chains[chainId] || `Chain ${chainId}`;
}
