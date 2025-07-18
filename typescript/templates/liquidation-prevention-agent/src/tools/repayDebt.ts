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
import { parseUserPreferences, mergePreferencesWithDefaults, generatePreferencesSummary } from '../utils/userPreferences.js';

// Input schema for repayDebt tool
const RepayDebtParams = z.object({
  tokenAddress: z.string().describe('The debt token contract address to repay'),
  amount: z.string().describe('The amount to repay (in token units, or "max" for full repayment)'),
  userAddress: z.string().describe('The user wallet address'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  chainId: z.string().optional().describe('The chain ID (defaults to Arbitrum)'),
  interestRateMode: z.enum(['1', '2']).optional().describe('Interest rate mode: 1 for stable, 2 for variable (defaults to 2)'),
});

// repayDebt tool implementation
export const repayDebtTool: VibkitToolDefinition<typeof RepayDebtParams, any, LiquidationPreventionContext, any> = {
  name: 'repay-debt',
  description: 'Repay debt on Aave to improve health factor and prevent liquidation',
  parameters: RepayDebtParams,
  execute: async (args, context) => {
    try {
      // Parse user preferences from instruction (Task 4.3)
      const userPrefs = parseUserPreferences(args.instruction || '');
      const mergedPrefs = mergePreferencesWithDefaults(userPrefs, {
        thresholds: context.custom.thresholds,
        monitoring: context.custom.monitoring,
        strategy: context.custom.strategy,
      });
      
      console.log(`💸 Repaying debt: ${args.amount} of ${args.tokenAddress} for user ${args.userAddress}`);
      console.log(`⚙️  User preferences: ${generatePreferencesSummary(mergedPrefs)}`);

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
            chainId: args.chainId || '42161', // Default to Arbitrum
            address: args.tokenAddress,
          },
          amount: args.amount,
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

      // Execute the transactions using the user's wallet
      try {
        console.log('⚡ Executing repay transactions...');
        const executionResult = await context.custom.executeTransaction('repay-debt', transactions);

        console.log(`✅ Successfully executed repay debt transactions`);

        // Return structured success response that frontend can display
        const successMessage = `💸 Successfully repaid ${args.amount} tokens to improve health factor and prevent liquidation`;
        
        return createSuccessTask(
          'repay-debt',
          undefined, // No artifacts needed
          `🛡️ ${successMessage}. ${executionResult}`
        );
      } catch (executionError) {
        console.error('❌ Transaction execution failed:', executionError);
        throw new Error(`Failed to execute repay transaction: ${executionError instanceof Error ? executionError.message : 'Unknown execution error'}`);
      }

    } catch (error) {
      console.error('❌ repayDebt tool error:', error);
      throw error instanceof Error ? error : new Error(`Failed to repay debt: ${error}`);
    }
  },
}; 
 