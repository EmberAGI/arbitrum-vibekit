/**
 * intelligentPreventionStrategy Tool
 * 
 * Analyzes user position, wallet balances, and provides strategy recommendations
 * for liquidation prevention.
 */

import { createSuccessTask, createErrorTask, type VibkitToolDefinition, parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import type { LiquidationPreventionContext } from '../context/types.js';
import { GetWalletLendingPositionsResponseSchema, GetWalletBalancesResponseSchema } from 'ember-schemas';
import { parseUserPreferences, mergePreferencesWithDefaults, generatePreferencesSummary } from '../utils/userPreferences.js';

// Input schema for intelligentPreventionStrategy tool
const IntelligentPreventionStrategyParams = z.object({
  userAddress: z.string().describe('The wallet address to analyze for liquidation prevention'),
  targetHealthFactor: z.number().optional().default(1.1).describe('Target health factor to maintain'),
  instruction: z.string().optional().describe('Natural language instruction with user preferences'),
  chainId: z.string().optional().default('42161').describe('Chain ID for the operation'),
});

// Strategy option interface
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
  description: 'Analyze user position and recommend optimal liquidation prevention strategy',
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

      // Access MCP clients from context
      const emberClient = context.custom.mcpClient;
      if (!emberClient) {
        throw new Error('Ember MCP client not found');
      }

      // Step 1: Get current position data
      console.log('📊 Step 1: Fetching current positions...');
      const positionsResult = await emberClient.callTool({
        name: 'getWalletLendingPositions',
        arguments: { walletAddress: args.userAddress },
      });

      if (positionsResult.isError) {
        throw new Error('Failed to fetch user positions');
      }

      // Step 2: Get wallet balances
      console.log('💰 Step 2: Fetching wallet balances...');
      const balancesResult = await emberClient.callTool({
        name: 'getWalletBalances',
        arguments: { walletAddress: args.userAddress },
      });

      if (balancesResult.isError) {
        throw new Error('Failed to fetch wallet balances');
      }

      // Parse data using proper schema validation
      const positionsData = parseMcpToolResponsePayload(positionsResult, GetWalletLendingPositionsResponseSchema);
      const balancesData = parseMcpToolResponsePayload(balancesResult, GetWalletBalancesResponseSchema);

      // Extract health factor and positions
      const positions = positionsData.positions || [];
      const firstPosition = positions[0];
      const currentHF = firstPosition?.healthFactor ? parseFloat(firstPosition.healthFactor) : undefined;
      const balances = balancesData.balances || [];

      // Step 3: Analyze strategies using 3-priority system
      console.log('🔍 Step 3: Analyzing prevention strategies...');
      
      // Get available collateral tokens (ETH, WETH, USDC, USDT, DAI, WBTC)
      const collateralTokens = balances.filter((balance: any) => 
        ['ETH', 'WETH', 'USDC', 'USDT', 'DAI', 'WBTC'].includes(balance.symbol.toUpperCase()) &&
        parseFloat(balance.amount) > 0 && 
        (balance.valueUsd || 0) > 10 // Min $10
      );

      // Get borrowed reserves
      const borrowedReserves = firstPosition?.userReserves?.filter(reserve => 
        parseFloat(reserve.variableBorrows) > 0
      ) || [];

      // Check if user has borrowed token balances for repayment
      const repayableTokens = borrowedReserves.filter(borrowedReserve => {
        const matchingBalance = balances.find(balance => 
          balance.token.address.toLowerCase() === borrowedReserve.token.tokenUid.address.toLowerCase()
        );
        return matchingBalance && parseFloat(matchingBalance.amount) > 0;
      });

      let selectedStrategy: StrategyOption;

      // Priority 1: Supply half of available collateral tokens
      if (collateralTokens.length > 0) {
        const bestCollateral = collateralTokens.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0))[0];
        if (bestCollateral) {
          const supplyAmount = (parseFloat(bestCollateral.amount) / 2).toString();
          
          selectedStrategy = {
            type: 'supply',
            priority: 1,
            estimatedCost: (bestCollateral.valueUsd || 0) / 2,
            estimatedHealthImprovement: 0.2,
            reason: `Priority 1: Supply half of available ${bestCollateral.symbol} collateral`,
             actions: [{
              tool: 'supply',
              tokenAddress: bestCollateral.token.address,
              amount: supplyAmount,
              description: `Supply ${supplyAmount} ${bestCollateral.symbol} as collateral`,
             }],
           };
          
          console.log(`✅ Strategy 1 selected: Supply ${supplyAmount} ${bestCollateral.symbol}`);
        } else {
          // Fallback if somehow no best collateral found
          selectedStrategy = {
            type: 'supply',
            priority: 0,
            estimatedCost: 0,
            estimatedHealthImprovement: 0,
            reason: 'No collateral tokens available',
            actions: [],
          };
        }
      }
      // Priority 2: Repay half of borrowed token debt
      else if (repayableTokens.length > 0) {
        const borrowedReserve = repayableTokens[0]; // Take first available
        if (borrowedReserve) {
          const matchingBalance = balances.find(balance => 
            balance.token.address.toLowerCase() === borrowedReserve.token.tokenUid.address.toLowerCase()
          );
          
          if (matchingBalance) {
            const debtAmount = parseFloat(borrowedReserve.variableBorrows);
            const availableAmount = parseFloat(matchingBalance.amount);
            const repayAmount = Math.min(debtAmount / 2, availableAmount).toString();
            
            selectedStrategy = {
              type: 'repay',
              priority: 2,
              estimatedCost: parseFloat(repayAmount) * (matchingBalance.valueUsd || 0) / parseFloat(matchingBalance.amount),
              estimatedHealthImprovement: 0.25,
              reason: `Priority 2: Repay half of ${borrowedReserve.token.symbol} debt`,
              actions: [{
                tool: 'repay',
                tokenAddress: borrowedReserve.token.tokenUid.address,
                amount: repayAmount,
                description: `Repay ${repayAmount} ${borrowedReserve.token.symbol} debt`,
              }],
            };
            
            console.log(`✅ Strategy 2 selected: Repay ${repayAmount} ${borrowedReserve.token.symbol}`);
          } else {
            // Fallback if no matching balance found
            selectedStrategy = {
              type: 'repay',
              priority: 0,
              estimatedCost: 0,
              estimatedHealthImprovement: 0,
              reason: 'No matching balance for debt repayment',
              actions: [],
            };
          }
        } else {
          // Fallback if no borrowed reserve found
          selectedStrategy = {
            type: 'repay',
            priority: 0,
            estimatedCost: 0,
            estimatedHealthImprovement: 0,
            reason: 'No borrowed reserves available',
            actions: [],
          };
        }
      }
      // Priority 3: Combined approach - supply half collateral + repay as much debt as possible
      else if (balances.length > 0) {
        const actions: any[] = [];
        let totalCost = 0;
        
        // Supply half of any available tokens
        if (balances.length > 0) {
          const bestBalance = balances.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0))[0];
          if (bestBalance && parseFloat(bestBalance.amount) > 0) {
            const supplyAmount = (parseFloat(bestBalance.amount) / 2).toString();
            actions.push({
              tool: 'supply',
              tokenAddress: bestBalance.token.address,
              amount: supplyAmount,
              description: `Supply ${supplyAmount} ${bestBalance.symbol} as collateral`,
            });
            totalCost += (bestBalance.valueUsd || 0) / 2;
          }
        }
        
        // Try to repay any debt with remaining balances
        for (const borrowedReserve of borrowedReserves) {
          const matchingBalance = balances.find(balance => 
            balance.token.address.toLowerCase() === borrowedReserve.token.tokenUid.address.toLowerCase()
          );
          
          if (matchingBalance && parseFloat(matchingBalance.amount) > 0) {
            const debtAmount = parseFloat(borrowedReserve.variableBorrows);
            const availableAmount = parseFloat(matchingBalance.amount);
            const repayAmount = Math.min(debtAmount, availableAmount).toString();
            
            actions.push({
              tool: 'repay',
              tokenAddress: borrowedReserve.token.tokenUid.address,
              amount: repayAmount,
              description: `Repay ${repayAmount} ${borrowedReserve.token.symbol} debt`,
            });
            totalCost += parseFloat(repayAmount) * (matchingBalance.valueUsd || 0) / parseFloat(matchingBalance.amount);
          }
        }
        
        selectedStrategy = {
          type: 'combined',
          priority: 3,
          estimatedCost: totalCost,
          estimatedHealthImprovement: 0.3,
          reason: 'Priority 3: Combined supply + repay strategy (insufficient single-token options)',
          actions,
        };
        
        console.log(`✅ Strategy 3 selected: Combined approach with ${actions.length} actions`);
      }
      // No viable strategy
      else {
        selectedStrategy = {
          type: 'supply',
          priority: 0,
          estimatedCost: 0,
          estimatedHealthImprovement: 0,
          reason: 'No viable strategy found - insufficient balances for any prevention action',
          actions: [],
        };
        
        console.log(`❌ No viable strategy found`);
      }

      console.log(`🎯 Selected strategy: Priority ${selectedStrategy.priority} - ${selectedStrategy.reason}`);

      // Create comprehensive response
      const message = [
        `🧠 **Intelligent Prevention Strategy Analysis**`,
        ``,
        `👤 **User:** ${args.userAddress}`,
        `📊 **Current Health Factor:** ${currentHF?.toFixed(4) || 'N/A'}`,
        `🎯 **Target Health Factor:** ${targetHF}`,
        ``,
        `📋 **Recommended Strategy:** ${selectedStrategy.type.toUpperCase()}`,
        `💡 **Reasoning:** ${selectedStrategy.reason}`,
        `💰 **Estimated Cost:** $${selectedStrategy.estimatedCost.toFixed(2)}`,
        `📈 **Expected HF Improvement:** +${selectedStrategy.estimatedHealthImprovement.toFixed(4)}`,
        ``,
        `🔧 **Actions to Execute:**`,
        ...selectedStrategy.actions.map(a => `  • ${a.description}`),
        ``,
        `⚠️  **Status:** Strategy analyzed successfully`,
        `🕐 **Analyzed:** ${new Date().toLocaleString()}`,
        ``,
        `📝 **Note:** This is a strategy recommendation. Execute using the specific supply/repay tools.`,
      ].join('\n');

      console.log(`✅ Strategy analysis complete: ${selectedStrategy.type} strategy recommended`);

      return createSuccessTask(
        'intelligent-prevention-strategy',
        undefined,
        `🧠 Strategy Analysis: Recommended ${selectedStrategy.type} strategy for improving health factor from ${currentHF?.toFixed(4) || 'N/A'} to ${targetHF}. ${message}`
      );

    } catch (error) {
      console.error('❌ intelligentPreventionStrategy error:', error);
      return createErrorTask(
        'intelligent-prevention-strategy',
        error instanceof Error ? error : new Error(`Failed to analyze prevention strategy: ${error}`)
      );
    }
  },
};
 