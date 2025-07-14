/**
 * supplyCollateral Tool
 * 
 * Supplies collateral to Aave via Ember MCP server to improve health factor
 * and prevent liquidation.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { TransactionPlan, TransactionPlanSchema } from 'ember-schemas';
import { parseUserPreferences, mergePreferencesWithDefaults, generatePreferencesSummary } from '../utils/userPreferences.js';

// Input schema for supplyCollateral tool
const SupplyCollateralParams = z.object({
  tokenAddress: z.string().describe('The token contract address to supply'),
  amount: z.string().describe('The amount to supply (in token units)'),
  userAddress: z.string().describe('The user wallet address'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  chainId: z.string().optional().describe('The chain ID (defaults to Arbitrum)'),
});

// supplyCollateral tool implementation
export const supplyCollateralTool: VibkitToolDefinition<typeof SupplyCollateralParams, any, LiquidationPreventionContext, any> = {
  name: 'supply-collateral',
  description: 'Supply tokens as collateral to Aave to improve health factor and prevent liquidation',
  parameters: SupplyCollateralParams,
  execute: async (args, context) => {
    try {
      // Parse user preferences from instruction (Task 4.3)
      const userPrefs = parseUserPreferences(args.instruction || '');
      const mergedPrefs = mergePreferencesWithDefaults(userPrefs, {
        thresholds: context.custom.thresholds,
        monitoring: context.custom.monitoring,
        strategy: context.custom.strategy,
      });
      
      console.log(`💰 Supplying collateral: ${args.amount} tokens at ${args.tokenAddress} for user ${args.userAddress}`);
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

      // Call the Ember MCP server's supply tool to get transaction plan
      const result = await emberClient.callTool({
        name: 'supply',
        arguments: {
          tokenAddress: args.tokenAddress,
          amount: args.amount,
          onBehalfOf: args.userAddress,
          chainId: args.chainId || '42161', // Default to Arbitrum
        },
      });

      if (result.isError) {
        console.error('❌ Error calling supply tool:', result.content);
        let errorMessage = 'Unknown error';
        if (Array.isArray(result.content) && result.content[0]?.text) {
          errorMessage = result.content[0].text;
        }
        return createErrorTask(
          'supply-collateral',
          new Error(`Failed to prepare supply transaction: ${errorMessage}`)
        );
      }

      // Parse and validate the transaction plan from MCP response
      console.log('📋 Parsing transaction plan from MCP response...');
      const dataToValidate = parseMcpToolResponsePayload(result, z.any());
      
      const validationResult = z.array(TransactionPlanSchema).safeParse(dataToValidate);
      if (!validationResult.success) {
        console.error('❌ Transaction plan validation failed:', validationResult.error);
        return createErrorTask(
          'supply-collateral',
          new Error('MCP supply tool returned invalid transaction data')
        );
      }

      const transactions: TransactionPlan[] = validationResult.data;
      console.log(`📋 Received ${transactions.length} transaction(s) to execute`);

      // Execute the transactions using the user's wallet
      try {
        console.log('⚡ Executing supply transactions...');
        const executionResult = await context.custom.executeTransaction('supply-collateral', transactions);
        
        // Create success message
        const message = [
          `✅ **Collateral Supply Successful**`,
          ``,
          `💰 **Amount:** ${args.amount} tokens`,
          `🏦 **Token:** ${args.tokenAddress}`,
          `👤 **User:** ${args.userAddress}`,
          `⛓️  **Chain:** ${args.chainId || '42161'}`,
          ``,
          `🔗 **Execution Result:** ${executionResult}`,
          `⏱️  **Timestamp:** ${new Date().toLocaleString()}`,
          ``,
          `🛡️ **Next Steps:** Monitor health factor improvement`,
        ].join('\n');

        console.log(`✅ Successfully executed supply collateral transactions`);

        return createSuccessTask(
          'supply-collateral',
          undefined,
          `🛡️ Collateral Supply: Successfully supplied ${args.amount} tokens to improve health factor. ${message}`
        );
      } catch (executionError) {
        console.error('❌ Transaction execution failed:', executionError);
        return createErrorTask(
          'supply-collateral',
          new Error(`Failed to execute supply transaction: ${executionError instanceof Error ? executionError.message : 'Unknown execution error'}`)
        );
      }

    } catch (error) {
      console.error('❌ supplyCollateral tool error:', error);
      return createErrorTask(
        'supply-collateral',
        error instanceof Error ? error : new Error(`Failed to supply collateral: ${error}`)
      );
    }
  },
}; 
 