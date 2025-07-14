/**
 * intelligentPreventionStrategy Tool
 * 
 * Analyzes user position, wallet balances, and automatically executes
 * the optimal liquidation prevention strategy (supply, repay, or combined).
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { TransactionPlan, TransactionPlanSchema } from 'ember-schemas';
import { parseUserPreferences, mergePreferencesWithDefaults, generatePreferencesSummary } from '../utils/userPreferences.js';

// Input schema for intelligentPreventionStrategy tool
const IntelligentPreventionStrategyParams = z.object({
  userAddress: z.string().describe('The user wallet address'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  targetHealthFactor: z.number().optional().describe('Target health factor to achieve (defaults to 1.1)'),
  maxSlippagePercent: z.number().optional().describe('Maximum slippage percentage (defaults to 2%)'),
  chainId: z.string().optional().describe('The chain ID (defaults to Arbitrum)'),
});

// Define strategy types
interface StrategyOption {
  type: 'supply' | 'repay' | 'combined';
  priority: number;
  estimatedCost: number;
  estimatedHealthImprovement: number;
  reason: string;
  actions: Array<{
    tool: 'supply' | 'repay';
    tokenAddress: string;
    amount: string;
    description: string;
  }>;
}

// intelligentPreventionStrategy tool implementation
export const intelligentPreventionStrategyTool: VibkitToolDefinition<typeof IntelligentPreventionStrategyParams, any, LiquidationPreventionContext, any> = {
  name: 'intelligent-prevention-strategy',
  description: 'Analyze user position and automatically execute the optimal liquidation prevention strategy',
  parameters: IntelligentPreventionStrategyParams,
  execute: async (args, context) => {
    try {
      // Parse user preferences from instruction (Task 4.3)
      const userPrefs = parseUserPreferences(args.instruction || '');
      const mergedPrefs = mergePreferencesWithDefaults(userPrefs, {
        thresholds: context.custom.thresholds,
        monitoring: context.custom.monitoring,
        strategy: context.custom.strategy,
      });
      
      const targetHF = mergedPrefs.targetHealthFactor || args.targetHealthFactor || 1.1;
      console.log(`🧠 Analyzing intelligent prevention strategy for user: ${args.userAddress}, target HF: ${targetHF}`);
      console.log(`⚙️  User preferences: ${generatePreferencesSummary(mergedPrefs)}`);

      // Ensure we have MCP clients available
      if (!context.mcpClients) {
        throw new Error('MCP clients not available in context');
      }

      const emberClient = context.mcpClients['ember-mcp-tool-server'];
      if (!emberClient) {
        throw new Error('Ember MCP client not found');
      }

      // Step 1: Get current position data
      console.log('📊 Step 1: Fetching current positions...');
      const positionsResult = await emberClient.callTool({
        name: 'getUserPositions',
        arguments: { userAddress: args.userAddress },
      });

      if (positionsResult.isError) {
        throw new Error('Failed to fetch user positions');
      }

      // Step 2: Get wallet balances
      console.log('💰 Step 2: Fetching wallet balances...');
      const balancesResult = await emberClient.callTool({
        name: 'getWalletBalances',
        arguments: { userAddress: args.userAddress, chainId: args.chainId || '42161' },
      });

      if (balancesResult.isError) {
        throw new Error('Failed to fetch wallet balances');
      }

      // Parse data
      const positionsContent = Array.isArray(positionsResult.content) ? positionsResult.content : [];
      const balancesContent = Array.isArray(balancesResult.content) ? balancesResult.content : [];
      
      const positionsData = JSON.parse(positionsContent[0]?.text || '{}');
      const balancesData = JSON.parse(balancesContent[0]?.text || '{}');

      const currentHF = positionsData.healthFactor;
      const positions = positionsData.positions || [];
      const balances = balancesData.balances || [];

      // Step 3: Analyze strategies
      console.log('🔍 Step 3: Analyzing prevention strategies...');
      const strategies: StrategyOption[] = [];

             // Strategy 1: Supply Collateral
       const supplyOptions = balances
         .filter((balance: any) => parseFloat(balance.balance) > 0 && balance.usdValue > 50) // Min $50
         .map((balance: any) => ({
           type: 'supply' as const,
           priority: calculateSupplyPriority(balance, positions),
           estimatedCost: parseFloat(balance.usdValue),
           estimatedHealthImprovement: estimateSupplyHealthImprovement(balance, positionsData),
           reason: `Supply ${balance.symbol} collateral (${balance.usdValue} USD available)`,
           actions: [{
             tool: 'supply' as const,
             tokenAddress: balance.tokenAddress,
             amount: balance.balance,
             description: `Supply ${balance.balance} ${balance.symbol}`,
           }],
         }));

       strategies.push(...supplyOptions);

       // Strategy 2: Repay Debt
       const repayOptions = positions
         .filter((pos: any) => pos.borrowedAmount > 0)
         .map((pos: any) => {
           const matchingBalance = balances.find((bal: any) => 
             bal.tokenAddress.toLowerCase() === pos.tokenAddress.toLowerCase()
           );
           
           if (!matchingBalance || parseFloat(matchingBalance.balance) === 0) {
             return null;
           }

           const repayAmount = Math.min(
             parseFloat(matchingBalance.balance),
             pos.borrowedAmount
           ).toString();

           return {
             type: 'repay' as const,
             priority: calculateRepayPriority(pos, matchingBalance),
             estimatedCost: parseFloat(repayAmount) * (pos.tokenPriceUsd || 1),
             estimatedHealthImprovement: estimateRepayHealthImprovement(pos, repayAmount, positionsData),
             reason: `Repay ${pos.tokenSymbol} debt (${repayAmount} available)`,
             actions: [{
               tool: 'repay' as const,
               tokenAddress: pos.tokenAddress,
               amount: repayAmount,
               description: `Repay ${repayAmount} ${pos.tokenSymbol}`,
             }],
           };
         })
         .filter(Boolean);

      strategies.push(...repayOptions);

      // Strategy 3: Combined Approach (if multiple options available)
      if (supplyOptions.length > 0 && repayOptions.length > 0) {
        const bestSupply = supplyOptions[0];
        const bestRepay = repayOptions[0];
        
        strategies.push({
          type: 'combined',
          priority: (bestSupply.priority + bestRepay.priority) / 2 + 10, // Bonus for combined
          estimatedCost: bestSupply.estimatedCost + bestRepay.estimatedCost,
          estimatedHealthImprovement: bestSupply.estimatedHealthImprovement + bestRepay.estimatedHealthImprovement,
          reason: 'Combined supply and repay for maximum health factor improvement',
          actions: [
            ...bestSupply.actions,
            ...bestRepay.actions,
          ],
        });
      }

      // Step 4: Select optimal strategy
      if (strategies.length === 0) {
        return createErrorTask(
          'intelligent-prevention-strategy',
          new Error('No viable liquidation prevention strategies found. User may lack sufficient balances.')
        );
      }

      // Sort by priority (higher is better)
      strategies.sort((a, b) => b.priority - a.priority);
      const optimalStrategy = strategies[0];

      if (!optimalStrategy) {
        return createErrorTask(
          'intelligent-prevention-strategy',
          new Error('No optimal strategy could be determined from available options.')
        );
      }

      console.log(`🎯 Selected strategy: ${optimalStrategy.type} - ${optimalStrategy.reason}`);

      // Step 5: Execute the optimal strategy
      console.log('⚡ Step 5: Executing optimal strategy...');
      const executionResults: any[] = [];

      for (const action of optimalStrategy.actions) {
        console.log(`🔄 Executing: ${action.description}`);
        
        try {
          let mcpResult;
          if (action.tool === 'supply') {
            mcpResult = await emberClient.callTool({
              name: 'supply',
              arguments: {
                tokenAddress: action.tokenAddress,
                amount: action.amount,
                onBehalfOf: args.userAddress,
                chainId: args.chainId || '42161',
              },
            });
          } else if (action.tool === 'repay') {
            mcpResult = await emberClient.callTool({
              name: 'repay',
              arguments: {
                asset: action.tokenAddress,
                amount: action.amount,
                onBehalfOf: args.userAddress,
                chainId: args.chainId || '42161',
                interestRateMode: '2', // Default to variable rate
              },
            });
          }

          if (mcpResult && !mcpResult.isError) {
            // Parse and execute the transaction
            const dataToValidate = parseMcpToolResponsePayload(mcpResult, z.any());
            const validationResult = z.array(TransactionPlanSchema).safeParse(dataToValidate);
            
            if (validationResult.success) {
              const transactions: TransactionPlan[] = validationResult.data;
              const executionResult = await context.custom.executeTransaction(action.tool, transactions);
              
              executionResults.push({
                action: action.description,
                success: true,
                result: executionResult,
              });
            } else {
              executionResults.push({
                action: action.description,
                success: false,
                result: 'Transaction validation failed',
              });
            }
          } else {
            executionResults.push({
              action: action.description,
              success: false,
              result: mcpResult?.isError ? 'MCP call failed' : 'Unknown MCP error',
            });
          }
        } catch (actionError) {
          console.error(`❌ Error executing ${action.description}:`, actionError);
          executionResults.push({
            action: action.description,
            success: false,
            result: actionError instanceof Error ? actionError.message : 'Unknown error',
          });
        }
      }

      // Create comprehensive response
      const successfulActions = executionResults.filter(r => r.success);
      const failedActions = executionResults.filter(r => !r.success);

      const message = [
        `🧠 **Intelligent Prevention Strategy Executed**`,
        ``,
        `📋 **Strategy Selected:** ${optimalStrategy.type.toUpperCase()}`,
        `💡 **Reasoning:** ${optimalStrategy.reason}`,
        `💰 **Estimated Cost:** $${optimalStrategy.estimatedCost.toFixed(2)}`,
        `📈 **Expected HF Improvement:** +${optimalStrategy.estimatedHealthImprovement.toFixed(4)}`,
        ``,
        `✅ **Successful Actions (${successfulActions.length}):**`,
        ...successfulActions.map(a => `  • ${a.action}`),
        failedActions.length > 0 ? `❌ **Failed Actions (${failedActions.length}):` : '',
        ...failedActions.map(a => `  • ${a.action}: ${a.result}`),
        ``,
        `⏱️ **Executed:** ${new Date().toLocaleString()}`,
        `🎯 **Target Health Factor:** ${targetHF}`,
        ``,
        `🔄 **Next Steps:** Monitor new health factor in a few minutes`,
      ].filter(line => line !== '').join('\n');

      const overallSuccess = successfulActions.length > 0;
      console.log(`${overallSuccess ? '✅' : '❌'} Strategy execution complete. ${successfulActions.length}/${executionResults.length} actions successful`);

      return createSuccessTask(
        'intelligent-prevention-strategy',
        undefined,
        `🧠 Intelligent Prevention: Executed ${optimalStrategy.type} strategy with ${successfulActions.length}/${executionResults.length} successful actions. ${message}`
      );

    } catch (error) {
      console.error('❌ intelligentPreventionStrategy error:', error);
      return createErrorTask(
        'intelligent-prevention-strategy',
        error instanceof Error ? error : new Error(`Failed to execute intelligent prevention strategy: ${error}`)
      );
    }
  },
};

// Helper methods for strategy analysis
function calculateSupplyPriority(balance: any, positions: any[]): number {
  let priority = 50; // Base priority
  
  // Higher priority for larger USD values
  priority += Math.min(parseFloat(balance.usdValue) / 100, 30);
  
  // Higher priority if token is already used as collateral
  const existingPosition = positions.find(p => 
    p.tokenAddress.toLowerCase() === balance.tokenAddress.toLowerCase() && p.isCollateral
  );
  if (existingPosition) priority += 20;
  
  return priority;
}

function calculateRepayPriority(position: any, balance: any): number {
  let priority = 60; // Base priority (slightly higher than supply)
  
  // Higher priority for higher borrow APY (more expensive debt)
  if (position.borrowApy) {
    priority += Math.min(position.borrowApy * 2, 25);
  }
  
  // Higher priority if can repay more of the debt
  const repayPercentage = Math.min(parseFloat(balance.balance) / position.borrowedAmount, 1);
  priority += repayPercentage * 15;
  
  return priority;
}

function estimateSupplyHealthImprovement(balance: any, positionsData: any): number {
  // Simplified estimation - supplying collateral improves HF
  const supplyValueUsd = parseFloat(balance.usdValue);
  const totalBorrowedUsd = positionsData.totalBorrowedUsd || 1;
  
  // Rough estimation: HF improvement = new_collateral / total_borrowed
  return supplyValueUsd / totalBorrowedUsd * 0.8; // Conservative estimate with LTV factor
}

function estimateRepayHealthImprovement(position: any, repayAmount: string, positionsData: any): number {
  // Simplified estimation - repaying debt improves HF
  const repayValueUsd = parseFloat(repayAmount) * (position.tokenPriceUsd || 1);
  const totalBorrowedUsd = positionsData.totalBorrowedUsd || 1;
  
  // Rough estimation: HF improvement = reduced_debt / remaining_total_borrowed
  return repayValueUsd / totalBorrowedUsd;
} 
 