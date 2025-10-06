/**
 * repayDebt Tool
 * 
 * Repays debt on Aave via Ember MCP server to improve health factor
 * and prevent liquidation.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { TransactionPlan, TransactionPlanSchema, RepayResponseSchema } from 'ember-schemas';
import { parseUserPreferences } from '../utils/userPreferences.js';
import { resolveTokenInfo, isTokenSymbol } from '../utils/tokenResolver.js';
import { withHooks, transactionSigningAfterHook, transactionValidationBeforeHook } from '../hooks/index.js';
import { roundToTokenDecimals, isValidTokenPrecision } from '../utils/decimalPrecision.js';

// Input schema for repayDebt tool (supports both tokenAddress and tokenSymbol)
const RepayDebtParams = z.object({
  tokenAddress: z.string().optional().describe('The debt token contract address to repay (alternative to tokenSymbol)'),
  tokenSymbol: z.string().optional().describe('The debt token symbol to repay (e.g., USDC, DAI, ETH - alternative to tokenAddress)'),
  amount: z.string().describe('The amount to repay (in token units, or "max" for full repayment)'),
  userAddress: z.string().describe('The user wallet address'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  chainId: z.string().optional().describe('The chain ID (42161 for Arbitrum, 1 for Ethereum, 10 for Optimism, 137 for Polygon, 8453 for Base)'),
  interestRateMode: z.enum(['1', '2']).optional().describe('Interest rate mode: 1 for stable, 2 for variable (defaults to 2)'),
}).refine(
  (data) => data.tokenAddress || data.tokenSymbol,
  {
    message: "Either tokenAddress or tokenSymbol must be provided",
    path: ["tokenAddress", "tokenSymbol"],
  }
);

// Base repayDebt tool implementation (transaction preparation only)
const baseRepayDebtTool: VibkitToolDefinition<typeof RepayDebtParams, any, LiquidationPreventionContext, any> = {
  name: 'repay-debt',
  description: 'Repay debt on Aave to improve health factor and prevent liquidation. Supports multiple chains (Arbitrum, Ethereum, Optimism, Polygon, Base) and both token addresses and symbols (e.g., USDC, DAI, ETH).',
  parameters: RepayDebtParams,
  execute: async (args, context) => {
    try {
      // Resolve token address and chain info from symbol or use provided address
      let finalTokenAddress: string;
      let finalChainId: string;
      
      if (args.tokenAddress) {
        // Use provided token address directly
        finalTokenAddress = args.tokenAddress;
        finalChainId = args.chainId || '42161'; // Default to Arbitrum if not specified
        console.log(`💸 Using provided token address: ${finalTokenAddress} on chain ${finalChainId}`);
      } else if (args.tokenSymbol) {
        // Resolve token symbol to address and chain using tokenMap
        if (!context.custom.tokenMap) {
          throw new Error('Token map not available. Cannot resolve token symbol.');
        }
        
        try {
          const tokenInfo = resolveTokenInfo(
            context.custom.tokenMap,
            args.tokenSymbol,
            args.chainId // Pass user's preferred chainId (if any)
          );
          finalTokenAddress = tokenInfo.address;
          finalChainId = tokenInfo.chainId;
          console.log(`💸 Resolved token symbol "${args.tokenSymbol}" to address: ${finalTokenAddress} on chain ${finalChainId}`);
        } catch (resolverError) {
          console.error(`❌ Token resolution failed for "${args.tokenSymbol}":`, resolverError);
          throw resolverError; // Re-throw with original error message
        }
      } else {
        throw new Error('Either tokenAddress or tokenSymbol must be provided');
      }
      
      // Parse user preferences from instruction (only for targetHealthFactor if needed)
      const userPrefs = parseUserPreferences(args.instruction || '');
      
      const tokenIdentifier = args.tokenSymbol || finalTokenAddress;
      console.log(`💸 Repaying debt: ${args.amount} of ${tokenIdentifier} for user ${args.userAddress}`);
      
      // Get token decimals from resolved token info for precision handling
      let tokenDecimals = 18; // Default to 18 decimals
      if (args.tokenSymbol && context.custom.tokenMap) {
        try {
          const tokenInfo = resolveTokenInfo(
            context.custom.tokenMap,
            args.tokenSymbol,
            args.chainId
          );
          tokenDecimals = tokenInfo.decimals;
          console.log(`🔢 Token ${args.tokenSymbol} has ${tokenDecimals} decimals`);
        } catch (error) {
          console.warn(`⚠️ Could not get decimals for ${args.tokenSymbol}, using default 18`);
        }
      }
      
      // Round amount to appropriate decimal precision to prevent ethers.js errors
      let processedAmount = args.amount;
      if (args.amount !== "max" && !isValidTokenPrecision(args.amount, tokenDecimals)) {
        const originalAmount = args.amount;
        processedAmount = roundToTokenDecimals(args.amount, tokenDecimals);
        console.log(`🔄 Rounded amount from ${originalAmount} to ${processedAmount} (${tokenDecimals} decimals)`);
      }
      
      if (userPrefs.targetHealthFactor) {
        console.log(`🎯 Target Health Factor: ${userPrefs.targetHealthFactor}`);
      }

      // Access Ember MCP client from custom context
      const emberClient = context.custom.mcpClient;

      if (!emberClient) {
        throw new Error('Ember MCP client not found in context');
      }

      // Call the Ember MCP server's lendingRepay tool to get transaction plan
      const result = await emberClient.callTool({
        name: 'lendingRepay',
        arguments: {
          tokenUid: {
            chainId: finalChainId,
            address: finalTokenAddress,
          },
          amount: processedAmount, // Use the precision-adjusted amount
          walletAddress: args.userAddress,
        },
      });

      if (result.isError) {
        console.error('❌ Error calling repay tool:', result.content);
        let errorMessage = 'Unknown error';
        if (Array.isArray(result.content) && result.content[0]?.text) {
          errorMessage = result.content[0].text;
        }
        throw new Error(`Failed to prepare repay transaction: ${errorMessage}`);
      }

      // Parse and validate the repay response from MCP
      console.log('📋 Parsing repay response from MCP...');
      const repayResp = parseMcpToolResponsePayload(result, RepayResponseSchema);
      const { transactions } = repayResp;
      console.log(`📋 Received ${transactions.length} transaction(s) to execute`);

      // Return transaction data for withHooks execution
      console.log(`📋 Prepared ${transactions.length} transaction(s) for secure execution via withHooks`);
      
      return {
        transactions,
        tokenIdentifier,
        amount: processedAmount, // Return the processed amount
        operation: 'repay-debt'
      };

    } catch (error) {
      console.error('❌ repayDebt tool error:', error);
      throw error instanceof Error ? error : new Error(`Failed to repay debt: ${error}`);
    }
  },
};

// Export the tool wrapped with withHooks for secure transaction signing
export const repayDebtTool = withHooks(baseRepayDebtTool, {
  before: transactionValidationBeforeHook,
  after: transactionSigningAfterHook,
}); 
 