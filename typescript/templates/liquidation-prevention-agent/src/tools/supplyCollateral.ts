/**
 * supplyCollateral Tool
 *
 * Supplies collateral to Aave via Ember MCP server to improve health factor
 * and prevent liquidation.
 */


import { type VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
// import { TransactionPlan, TransactionPlanSchema, SupplyTokensResponseSchema } from 'ember-api';
import { parseUserPreferences } from '../utils/userPreferences.js';
import { resolveTokenInfo } from '../utils/tokenResolver.js';
import { withHooks, transactionSigningAfterHook, transactionValidationBeforeHook } from '../hooks/index.js';

// Input schema for supplyCollateral tool (updated for new createLendingSupply tool)
const SupplyCollateralParams = z.object({
 tokenAddress: z.string().optional().describe('The token contract address to supply (alternative to tokenSymbol)'),
 tokenSymbol: z.string().optional().describe('The token symbol to supply (e.g., USDC, DAI, ETH - alternative to tokenAddress)'),
 amount: z.string().describe('The amount to supply (in token units)'),
 userAddress: z.string().describe('The user wallet address'),
 instruction: z.string().optional().describe('Natural language instruction with user preferences'),
 chainId: z.string().optional().describe('The chain ID (42161 for Arbitrum, 1 for Ethereum, 10 for Optimism, 137 for Polygon, 8453 for Base)'),
}).refine(
 (data) => data.tokenAddress || data.tokenSymbol,
 {
   message: "Either tokenAddress or tokenSymbol must be provided",
   path: ["tokenAddress", "tokenSymbol"],
 }
);

// Base supplyCollateral tool implementation (transaction preparation only)
const baseSupplyCollateralTool: VibkitToolDefinition<typeof SupplyCollateralParams, any, LiquidationPreventionContext, any> = {
 name: 'supply-collateral',
 description: 'Supply tokens as collateral to Aave to improve health factor and prevent liquidation. Supports multiple chains (Arbitrum, Ethereum, Optimism, Polygon, Base) and both token addresses and symbols (e.g., USDC, DAI, ETH).',
 parameters: SupplyCollateralParams,
 execute: async (args, context) => {
   try {
     // Resolve token address and chain info from symbol or use provided address
     let finalTokenAddress: string;
     let finalChainId: string;

     if (args.tokenAddress) {
       // Use provided token address directly
       finalTokenAddress = args.tokenAddress;
       finalChainId = args.chainId || '42161'; // Default to Arbitrum if not specified
       console.log(`💰 Using provided token address: ${finalTokenAddress} on chain ${finalChainId}`);
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
         console.log(`💰 Resolved token symbol "${args.tokenSymbol}" to address: ${finalTokenAddress} on chain ${finalChainId}`);
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
    console.log(`💰 Supplying collateral: ${args.amount} ${tokenIdentifier} for user ${args.userAddress}`);

     if (userPrefs.targetHealthFactor) {
       console.log(`🎯 Target Health Factor: ${userPrefs.targetHealthFactor}`);
     }
     console.log('💰 args........:', args);

     // Access Ember MCP client from custom context
     const emberClient = context.custom.mcpClient;

     if (!emberClient) {
       throw new Error('Ember MCP client not found in context');
     }

    console.log("calling createLendingSupply..........!!!");
    console.log("finalTokenAddress..........!!:", finalTokenAddress);
    console.log("finalChainId..........!!:", finalChainId);
    console.log("args.amount..........!!:", args.amount);
    console.log("args.userAddress..........!!:", args.userAddress);
    console.log("args.tokenSymbol..........!!:", args.tokenSymbol);
    console.log("args.tokenAddress..........!!:", args.tokenAddress);
    console.log("args.chainId..........!!:", args.chainId);

    // Determine the token symbol to send to the new API
    const supplyToken = args.tokenSymbol || finalTokenAddress;

    // Call the Ember MCP server's createLendingSupply tool to get transaction plan
    const result = await emberClient.callTool({
      name: 'createLendingSupply',
      arguments: {
        walletAddress: args.userAddress,
        amount: args.amount, // Use original human-readable amount - tool handles decimals
        supplyChain: finalChainId,
        supplyToken: supplyToken,
      },
    });
     console.log('💰 supplyCollateral result........:', result);

     if (result.isError) {
       console.error('❌ Error calling supply tool:', result.content);
       let errorMessage = 'Unknown error';
       if (Array.isArray(result.content) && result.content[0]?.text) {
         errorMessage = result.content[0].text;
       }
       throw new Error(`Failed to prepare supply transaction: ${errorMessage}`);
     }

    // Parse and validate the supply response from MCP
    console.log('📋 Parsing supply response from MCP...');

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
      throw new Error('No transactions received from createLendingSupply tool');
    }

     // Return transaction data for withHooks execution
     console.log(`📋 Prepared ${transactions.length} transaction(s) for secure execution via withHooks`);

     return {
       transactions,
       tokenIdentifier,
       amount: args.amount, // Return the original human-readable amount
       operation: 'supply-collateral'
     };

   } catch (error) {
     console.error('❌ supplyCollateral tool error:', error);
     throw error instanceof Error ? error : new Error(`Failed to supply collateral: ${error}`);
   }
 },
};

// Export the tool wrapped with withHooks for secure transaction signing
export const supplyCollateralTool = withHooks(baseSupplyCollateralTool, {
 before: transactionValidationBeforeHook,
 after: transactionSigningAfterHook,
});
