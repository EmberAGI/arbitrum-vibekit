/**
 * supplyCollateral Tool
 * 
 * Supplies collateral to Aave via Ember MCP server to improve health factor
 * and prevent liquidation.
 */


import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { TransactionPlan, TransactionPlanSchema, SupplyResponseSchema } from 'ember-schemas';
import { parseUserPreferences } from '../utils/userPreferences.js';
import { resolveTokenInfo, isTokenSymbol } from '../utils/tokenResolver.js';
import { withHooks, transactionSigningAfterHook, transactionValidationBeforeHook } from '../hooks/index.js';
import { roundToTokenDecimals, isValidTokenPrecision } from '../utils/decimalPrecision.js';

// Input schema for supplyCollateral tool (supports both tokenAddress and tokenSymbol)
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
     console.log('💰 args........:', args);
     
     // Access Ember MCP client from custom context  
     const emberClient = context.custom.mcpClient;

     if (!emberClient) {
       throw new Error('Ember MCP client not found in context');
     }

     console.log("calling lendingSupply..........!!!");
     console.log("finalTokenAddress..........!!:", finalTokenAddress);
     console.log("finalChainId..........!!:", finalChainId);
     console.log("args.amount..........!!:", args.amount);
     console.log("args.userAddress..........!!:", args.userAddress);
     console.log("args.tokenSymbol..........!!:", args.tokenSymbol);
     console.log("args.tokenAddress..........!!:", args.tokenAddress);
     console.log("args.chainId..........!!:", args.chainId);
     // Call the Ember MCP server's lendingSupply tool to get transaction plan
     const result = await emberClient.callTool({
       name: 'lendingSupply',
       arguments: {
         tokenUid: {
           chainId: finalChainId,
           address: finalTokenAddress,
         },
         amount: processedAmount, // Use the precision-adjusted amount
         walletAddress: args.userAddress,
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
     const supplyResp = parseMcpToolResponsePayload(result, SupplyResponseSchema);
     const { transactions } = supplyResp;
     console.log(`📋 Received ${transactions.length} transaction(s) to execute`);

     // Return transaction data for withHooks execution
     console.log(`📋 Prepared ${transactions.length} transaction(s) for secure execution via withHooks`);
     
     return {
       transactions,
       tokenIdentifier,
       amount: processedAmount, // Return the processed amount
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
