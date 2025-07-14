/**
 * repayDebt Tool
 * 
 * Repays debt on Aave via Ember MCP server to improve health factor
 * and prevent liquidation.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { TransactionPlan, TransactionPlanSchema } from 'ember-schemas';
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

      // Ensure we have MCP clients available
      if (!context.mcpClients) {
        throw new Error('MCP clients not available in context');
      }

      // Access Ember MCP client
      const emberClient = context.mcpClients['ember-mcp-tool-server'];

      if (!emberClient) {
        throw new Error('Ember MCP client not found. Available clients: ' + Object.keys(context.mcpClients).join(', '));
      }

      // Call the Ember MCP server's repay tool to get transaction plan
      const result = await emberClient.callTool({
        name: 'repay',
        arguments: {
          asset: args.tokenAddress,
          amount: args.amount,
          onBehalfOf: args.userAddress,
          chainId: args.chainId || '42161', // Default to Arbitrum
          interestRateMode: args.interestRateMode || '2', // Default to variable rate
        },
      });

      if (result.isError) {
        console.error('❌ Error calling repay tool:', result.content);
        let errorMessage = 'Unknown error';
        if (Array.isArray(result.content) && result.content[0]?.text) {
          errorMessage = result.content[0].text;
        }
        return createErrorTask(
          'repay-debt',
          new Error(`Failed to prepare repay transaction: ${errorMessage}`)
        );
      }

      // Parse and validate the transaction plan from MCP response
      console.log('📋 Parsing transaction plan from MCP response...');
      const dataToValidate = parseMcpToolResponsePayload(result, z.any());
      
      const validationResult = z.array(TransactionPlanSchema).safeParse(dataToValidate);
      if (!validationResult.success) {
        console.error('❌ Transaction plan validation failed:', validationResult.error);
        return createErrorTask(
          'repay-debt',
          new Error('MCP repay tool returned invalid transaction data')
        );
      }

      const transactions: TransactionPlan[] = validationResult.data;
      console.log(`📋 Received ${transactions.length} transaction(s) to execute`);

      // Execute the transactions using the user's wallet
      try {
        console.log('⚡ Executing repay transactions...');
        const executionResult = await context.custom.executeTransaction('repay-debt', transactions);
        
        // Create success message
        const rateMode = args.interestRateMode === '1' ? 'Stable' : 'Variable';
        const message = [
          `✅ **Debt Repayment Successful**`,
          ``,
          `💸 **Amount:** ${args.amount} tokens`,
          `🏦 **Token:** ${args.tokenAddress}`,
          `👤 **User:** ${args.userAddress}`,
          `⛓️  **Chain:** ${args.chainId || '42161'}`,
          `📊 **Rate Mode:** ${rateMode}`,
          ``,
          `🔗 **Execution Result:** ${executionResult}`,
          `⏱️  **Timestamp:** ${new Date().toLocaleString()}`,
          ``,
          `🛡️ **Next Steps:** Monitor health factor improvement`,
        ].join('\n');

        console.log(`✅ Successfully executed repay debt transactions`);

        return createSuccessTask(
          'repay-debt',
          undefined,
          `🛡️ Debt Repayment: Successfully repaid ${args.amount} tokens to improve health factor. ${message}`
        );
      } catch (executionError) {
        console.error('❌ Transaction execution failed:', executionError);
        return createErrorTask(
          'repay-debt',
          new Error(`Failed to execute repay transaction: ${executionError instanceof Error ? executionError.message : 'Unknown execution error'}`)
        );
      }

    } catch (error) {
      console.error('❌ repayDebt tool error:', error);
      return createErrorTask(
        'repay-debt',
        error instanceof Error ? error : new Error(`Failed to repay debt: ${error}`)
      );
    }
  },
}; 
 