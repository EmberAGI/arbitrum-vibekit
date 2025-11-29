/**
 * repayDebt Tool
 *
 * Repays debt on Aave via Ember MCP server to improve health factor
 * and prevent liquidation.
 */

import { type VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
// import { TransactionPlan, TransactionPlanSchema, RepayTokensResponseSchema } from 'ember-api';
import { parseUserPreferences } from '../utils/userPreferences.js';
import { resolveTokenInfo } from '../utils/tokenResolver.js';
import { withHooks, transactionSigningAfterHook, transactionValidationBeforeHook } from '../hooks/index.js';

// Input schema for repayDebt tool (updated for new createLendingRepay tool)
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

      if (userPrefs.targetHealthFactor) {
        console.log(`🎯 Target Health Factor: ${userPrefs.targetHealthFactor}`);
      }

      // Access Ember MCP client from custom context
      const emberClient = context.custom.mcpClient;

      if (!emberClient) {
        throw new Error('Ember MCP client not found in context');
      }

      console.log("calling createLendingRepay..........!!!");
      console.log("finalTokenAddress..........!!:", finalTokenAddress);
      console.log("finalChainId..........!!:", finalChainId);
      console.log("args.amount..........!!:", args.amount);
      console.log("args.userAddress..........!!:", args.userAddress);
      console.log("args.tokenSymbol..........!!:", args.tokenSymbol);
      console.log("args.tokenAddress..........!!:", args.tokenAddress);
      console.log("args.chainId..........!!:", args.chainId);

      // Determine the token symbol to send to the new API
      const repayToken = args.tokenSymbol || finalTokenAddress;

      // Call the Ember MCP server's createLendingRepay tool to get transaction plan
      const result = await emberClient.callTool({
        name: 'createLendingRepay',
        arguments: {
          walletAddress: args.userAddress,
          amount: args.amount, // Use original human-readable amount - tool handles decimals
          repayChain: finalChainId,
          repayToken: repayToken,
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

      // Handle the new response format with structuredContent
      let transactions: any[] = [];
      if (result.content && Array.isArray(result.content)) {
        // Check if there's structured content
        const structuredContent = result.content.find((item: any) => item.type === 'text' && item.text);
        if (structuredContent) {
          try {
            const parsedContent = JSON.parse(structuredContent.text);
            if (parsedContent.structuredContent && parsedContent.structuredContent.transactions) {
              transactions = parsedContent.structuredContent.transactions;
            }
          } catch (parseError) {
            console.warn('⚠️ Could not parse structured content, trying direct access');
          }
        }
      }

      // Fallback: try to access transactions directly from result
      if (transactions.length === 0 && result.content) {
        try {
          // Try to find transactions in the response structure
          const content = Array.isArray(result.content) ? result.content[0] : result.content;
          if (content && typeof content === 'object' && content.structuredContent && content.structuredContent.transactions) {
            transactions = content.structuredContent.transactions;
          }
        } catch (error) {
          console.warn('⚠️ Could not extract transactions from response');
        }
      }

      console.log(`📋 Received ${transactions.length} transaction(s) to execute`);

      // Validate that we have transactions to execute
      if (transactions.length === 0) {
        throw new Error('No transactions received from createLendingRepay tool');
      }

      // Return transaction data for withHooks execution
      console.log(`📋 Prepared ${transactions.length} transaction(s) for secure execution via withHooks`);

      return {
        transactions,
        tokenIdentifier,
        amount: args.amount, // Return the original human-readable amount
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
