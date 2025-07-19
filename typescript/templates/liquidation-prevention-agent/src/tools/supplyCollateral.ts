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
import { parseUserPreferences, mergePreferencesWithDefaults, generatePreferencesSummary } from '../utils/userPreferences.js';
import { resolveTokenInfo, isTokenSymbol } from '../utils/tokenResolver.js';

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

// supplyCollateral tool implementation
export const supplyCollateralTool: VibkitToolDefinition<typeof SupplyCollateralParams, any, LiquidationPreventionContext, any> = {
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
      
      // Parse user preferences from instruction (Task 4.3)
      const userPrefs = parseUserPreferences(args.instruction || '');
      const mergedPrefs = mergePreferencesWithDefaults(userPrefs, {
        thresholds: context.custom.thresholds,
        monitoring: context.custom.monitoring,
        strategy: context.custom.strategy,
      });
      
      const tokenIdentifier = args.tokenSymbol || finalTokenAddress;
      console.log(`💰 Supplying collateral: ${args.amount} ${tokenIdentifier} for user ${args.userAddress}`);
      console.log(`⚙️  User preferences: ${generatePreferencesSummary(mergedPrefs)}`);
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
          amount: args.amount,
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

      // Execute the transactions using the user's wallet
      try {
        console.log('⚡ Executing supply transactions...');
        const executionResult = await context.custom.executeTransaction('supply-collateral', transactions);

        console.log(`✅ Successfully executed supply collateral transactions`);

        // Return structured success response that frontend can display
        const successMessage = `💰 Successfully supplied ${args.amount} ${tokenIdentifier} as collateral to improve health factor and prevent liquidation`;
        
        return createSuccessTask(
          'supply-collateral',
          undefined, // No artifacts needed
          `🛡️ ${successMessage}. ${executionResult}`
        );
      } catch (executionError) {
        console.error('❌ Transaction execution failed:', executionError);
        throw new Error(`Failed to execute supply transaction: ${executionError instanceof Error ? executionError.message : 'Unknown execution error'}`);
      }

    } catch (error) {
      console.error('❌ supplyCollateral tool error:', error);
      throw error instanceof Error ? error : new Error(`Failed to supply collateral: ${error}`);
    }
  },
}; 
 