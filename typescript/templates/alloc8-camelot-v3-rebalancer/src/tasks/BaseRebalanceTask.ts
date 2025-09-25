/**
 * Base class for rebalancing tasks
 */

import { z } from 'zod';
import type { Task, TaskStatus } from '@google-a2a/types';
import { TaskState } from '@google-a2a/types';
import { nanoid } from 'nanoid';
import { getWalletAddressFromPrivateKey } from '../utils/walletUtils.js';
import type { RebalancerContext } from '../context/types.js';
import type {
  RebalanceEvaluation,
  PoolPosition,
  PoolState,
  TokenMarketData,
} from '../config/types.js';
import { DiscoveryMode } from '../config/types.js';
import type { EnhancedPoolPosition } from '../utils/directPositionFetcher.js';
import { fetchActivePositions } from '../utils/directPositionFetcher.js';

export abstract class BaseRebalanceTask {
  public readonly id: string;
  public readonly contextId: string;
  protected context: RebalancerContext;
  protected isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(context: RebalancerContext) {
    this.id = nanoid();
    this.contextId = nanoid();
    this.context = context;
  }

  /**
   * Abstract method to get the task name
   */
  public abstract getTaskName(): string;

  /**
   * Start the task with periodic execution
   */
  public start(): void {
    if (this.isRunning) {
      console.log('⚠️  Task already running');
      return;
    }

    this.isRunning = true;
    this.context.monitoringState.isActive = true;
    this.context.monitoringState.taskId = this.id;

    console.log(`🚀 Starting ${this.getTaskName()} (ID: ${this.id})`);
    console.log(`   Check interval: ${this.context.config.checkInterval / 1000}s`);

    // Run immediately
    this.executeTask();

    // Schedule periodic execution
    this.intervalId = setInterval(() => {
      this.executeTask();
    }, this.context.config.checkInterval);
  }

  /**
   * Stop the task
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log('⚠️  Task not running');
      return;
    }

    this.isRunning = false;
    this.context.monitoringState.isActive = false;
    this.context.monitoringState.taskId = null;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log(`🛑 Stopped ${this.getTaskName()}`);
  }

  /**
   * Get task status
   */
  public getStatus(): TaskStatus {
    return {
      state: this.isRunning ? TaskState.Working : TaskState.Completed,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create A2A Task object
   */
  public toTask(): Task {
    return {
      id: this.id,
      contextId: this.contextId,
      status: this.getStatus(),
      kind: 'task',
      history: [],
      artifacts: [],
      metadata: {
        taskType: this.getTaskName(),
        config: this.context.config,
        monitoringState: this.context.monitoringState,
      },
    };
  }

  /**
   * Execute the task logic
   */
  private async executeTask(): Promise<void> {
    try {
      console.log(`🔄 Executing ${this.getTaskName()} check...`);
      this.context.monitoringState.lastCheck = new Date();

      await this.run();
    } catch (error) {
      console.error(`❌ Error in ${this.getTaskName()}:`, error);
      await this.handleError(error as Error);
    }
  }

  /**
   * Fetch and evaluate current positions
   */
  protected async fetchAndEvaluate(): Promise<RebalanceEvaluation[]> {
    try {
      // Get wallet address from private key
      const walletAddress = getWalletAddressFromPrivateKey(this.context.config.walletPrivateKey);

      console.log(`🔍 Fetching positions for wallet: ${walletAddress}`);

      let positions: EnhancedPoolPosition[] = [];

      if (this.context.config.discoveryMode === DiscoveryMode.SINGLE_POOL) {
        console.log(`🔍 Single pool mode - Pool address: ${this.context.config.poolId}`);
        console.log(
          `⚠️  Single pool mode not yet supported with direct GraphQL fetching. Using auto-discovery instead.`
        );
      }

      // Use direct GraphQL fetching for all modes
      console.log(`🔍 Fetching positions using direct GraphQL from Camelot v3 subgraph...`);

      try {
        positions = await fetchActivePositions(walletAddress);

        // If in single pool mode, filter positions by pool address
        if (
          this.context.config.discoveryMode === DiscoveryMode.SINGLE_POOL &&
          this.context.config.poolId
        ) {
          const filteredPositions = positions.filter(
            pos => pos.poolAddress.toLowerCase() === this.context.config.poolId!.toLowerCase()
          );
          console.log(
            `📍 Filtered to ${filteredPositions.length} positions for pool ${this.context.config.poolId}`
          );
          positions = filteredPositions;
        }

        console.log(`📍 Found ${positions.length} positions using direct GraphQL`);
      } catch (error) {
        console.error('❌ Error fetching positions with direct GraphQL:', error);
        throw error;
      }

      if (positions.length === 0) {
        console.log('ℹ️  No positions found for monitoring');
        return [];
      }

      console.log(`📍 Found ${positions.length} positions to evaluate`);

      // Update monitoring state with current position IDs
      this.context.monitoringState.currentPositions = positions.map(p => p.positionId);

      const evaluations: RebalanceEvaluation[] = [];

      // Evaluate each position
      for (const position of positions) {
        try {
          console.log(`\n🔍 Evaluating position ${position.positionId}...`);

          // Calculate current price from position data
          const currentPrice = parseFloat(position.currentPrice || '0');
          if (currentPrice === 0) {
            console.warn(`⚠️  Invalid price data for position ${position.positionId}`);
            continue;
          }

          // Calculate KPIs for the pool
          const kpiResponse = await this.calculatePoolKPIs(position, currentPrice);
          if (!kpiResponse.success) {
            console.warn(
              `⚠️  Could not calculate KPIs for position ${position.positionId}: ${kpiResponse.error}`
            );
            continue;
          }

          const kpis = kpiResponse.data;

          // Analyze position with LLM
          const analysisResponse = await this.analyzePositionWithLLM(position, kpis);
          if (!analysisResponse.success) {
            console.warn(
              `⚠️  Could not analyze position ${position.positionId}: ${analysisResponse.error}`
            );
            continue;
          }

          const analysis = analysisResponse.data;

          // Calculate price deviation
          const priceDeviation = await this.calculatePriceDeviation(position, currentPrice);

          // Check if rebalancing is needed based on LLM analysis
          const needsRebalance =
            analysis.recommendation.action === 'rebalance' &&
            analysis.recommendation.confidence > 0.6;

          const evaluation: RebalanceEvaluation = {
            positionId: position.positionId,
            poolAddress: position.poolAddress,
            currentPrice,
            priceDeviation,
            needsRebalance,
            currentRange: {
              lower: position.tickLower,
              upper: position.tickUpper,
            },
            isInRange: position.isInRange,
            liquidity: position.liquidity,
            fees: {
              token0: position.fees0,
              token1: position.fees1,
            },
            // Add token information for withdrawal operations
            token0: position.token0,
            token1: position.token1,
            token0Symbol: position.token0Symbol || 'UNKNOWN',
            token1Symbol: position.token1Symbol || 'UNKNOWN',
            // Add position value information
            amountUSD: position.amountUSD,
            tvlUSD: position.tvlUSD,
            recommendation: needsRebalance
              ? {
                  action: analysis.recommendation.action,
                  newRange: {
                    lower:
                      analysis.recommendation.new_range?.lower_tick ||
                      analysis.recommendation.new_range?.lower,
                    upper:
                      analysis.recommendation.new_range?.upper_tick ||
                      analysis.recommendation.new_range?.upper,
                  },
                  confidence: analysis.recommendation.confidence,
                  reasoning: analysis.recommendation.reasoning,
                }
              : undefined,
            kpis: kpis,
            llmAnalysis: analysis,
            timestamp: new Date(),
          };

          evaluations.push(evaluation);

          console.log(`📊 Position ${position.positionId} evaluation:`);
          console.log(
            `   Token pair: ${position.token0Symbol || position.token0.slice(0, 6)}.../${position.token1Symbol || position.token1.slice(0, 6)}...`
          );
          console.log(`   Current price: $${currentPrice.toFixed(6)}`);
          console.log(`   Price deviation: ${(priceDeviation * 100).toFixed(2)}%`);
          console.log(`   In range: ${position.isInRange ? '✅' : '❌'}`);
          console.log(`   Needs rebalance: ${needsRebalance ? '🔄 YES' : '✅ NO'}`);
          console.log(
            `   LLM confidence: ${(analysis.recommendation.confidence * 100).toFixed(1)}%`
          );

          if (needsRebalance && evaluation.recommendation) {
            console.log(`   Recommendation: ${evaluation.recommendation.action}`);
            console.log(
              `   New range: [${evaluation.recommendation.newRange.lower}, ${evaluation.recommendation.newRange.upper}]`
            );
            console.log(`   Reasoning: ${evaluation.recommendation.reasoning}`);
          }
        } catch (positionError) {
          console.error(`❌ Error evaluating position ${position.positionId}:`, positionError);
          continue;
        }
      }

      console.log(`\n📊 Evaluation Summary:`);
      console.log(`   Total positions: ${positions.length}`);
      console.log(`   Successfully evaluated: ${evaluations.length}`);
      console.log(
        `   Positions needing rebalance: ${evaluations.filter(e => e.needsRebalance).length}`
      );

      return evaluations;
    } catch (error) {
      console.error('❌ Error in fetchAndEvaluate:', error);
      throw error;
    }
  }

  /**
   * Calculate price deviation from position range
   */
  protected async calculatePriceDeviation(
    position: EnhancedPoolPosition,
    currentPrice: number
  ): Promise<number> {
    // Import price calculation utilities
    const { calculatePriceDeviation, tickToPrice } = await import('../utils/priceCalculations.js');

    // Convert ticks to prices using proper calculation
    const token0Decimals = position.token0Decimals || 18;
    const token1Decimals = position.token1Decimals || 6;

    const lowerPrice = tickToPrice(position.tickLower, token0Decimals, token1Decimals);
    const upperPrice = tickToPrice(position.tickUpper, token0Decimals, token1Decimals);

    // Calculate deviation using utility function
    return calculatePriceDeviation(currentPrice, lowerPrice, upperPrice);
  }

  /**
   * Calculate pool KPIs using the KPI calculator tool
   */
  protected async calculatePoolKPIs(position: PoolPosition, currentPrice: number) {
    try {
      // Import the KPI calculator tool
      const { calculatePoolKPIsTool } = await import('../tools/calculatePoolKPIs.js');

      // Create AgentContext wrapper
      const agentContext = {
        custom: this.context,
        mcpClients: this.context.mcpClients,
        llm: this.context.llm,
      };

      // Execute the KPI calculation
      const result = await calculatePoolKPIsTool.execute(
        {
          poolAddress: position.poolAddress,
          positionRange: {
            lower: position.tickLower,
            upper: position.tickUpper,
          },
          currentPrice: currentPrice,
          tickSpacing: 1, // Default tick spacing for Camelot v3
        },
        agentContext
      );

      if ('artifacts' in result && result.artifacts && result.artifacts.length > 0) {
        const artifact = result.artifacts[0];
        if (artifact && artifact.parts && artifact.parts.length > 0) {
          const part = artifact.parts[0];
          if (part && 'text' in part) {
            const kpis = JSON.parse(part.text);
            return { success: true, data: kpis };
          }
        }
      }
      return { success: false, error: 'No valid artifacts returned from KPI calculation' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate KPIs',
      };
    }
  }

  /**
   * Analyze position with LLM using the analysis tool
   */
  protected async analyzePositionWithLLM(position: EnhancedPoolPosition, kpis: any) {
    try {
      // Import the LLM analysis tool
      const { analyzePositionWithLLMTool } = await import('../tools/analyzePositionWithLLM.js');

      // Create AgentContext wrapper
      const agentContext = {
        custom: this.context,
        mcpClients: this.context.mcpClients,
        llm: this.context.llm,
      };

      // Get current price from position data
      const currentPrice = parseFloat(position.currentPrice || '0');
      const token0Decimals = position.token0Decimals || 18;
      const token1Decimals = position.token1Decimals || 6;
      const tickSpacing = 1; // Default for Camelot v3

      // Execute the LLM analysis
      const result = await analyzePositionWithLLMTool.execute(
        {
          positionId: position.positionId,
          poolAddress: position.poolAddress,
          currentRange: {
            lower: position.tickLower,
            upper: position.tickUpper,
          },
          currentPrice: currentPrice,
          token0Decimals: token0Decimals,
          token1Decimals: token1Decimals,
          tickSpacing: tickSpacing,
          kpis: kpis,
          riskProfile: this.context.config.riskProfile as 'conservative' | 'medium' | 'aggressive',
        },
        agentContext
      );

      if ('artifacts' in result && result.artifacts && result.artifacts.length > 0) {
        const artifact = result.artifacts[0];
        if (artifact && artifact.parts && artifact.parts.length > 0) {
          const part = artifact.parts[0];
          if (part && 'text' in part) {
            const analysis = JSON.parse(part.text);
            return { success: true, data: analysis };
          }
        }
      }
      return { success: false, error: 'No valid artifacts returned from LLM analysis' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze position with LLM',
      };
    }
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract run(): Promise<void>;
  protected abstract handleError(error: Error): Promise<void>;
}
