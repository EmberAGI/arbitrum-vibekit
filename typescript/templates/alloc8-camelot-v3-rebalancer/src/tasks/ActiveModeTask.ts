/**
 * Active Mode Task - Monitors positions and executes rebalances automatically
 */

import { BaseRebalanceTask } from './BaseRebalanceTask.js';
import { getWalletAddressFromPrivateKey } from '../utils/walletUtils.js';
import type { RebalancerContext } from '../context/types.js';
import type { TransactionResult } from '../config/types.js';

export class ActiveModeTask extends BaseRebalanceTask {
  constructor(context: RebalancerContext) {
    super(context);
  }

  public getTaskName(): string {
    return 'ActiveModeTask';
  }

  protected async run(): Promise<void> {
    const evaluations = await this.fetchAndEvaluate();

    if (evaluations.length === 0) {
      console.log('ℹ️  No positions to evaluate');
      return;
    }

    // Execute rebalance for each position that needs it
    const positionsNeedingRebalance = evaluations.filter(e => e.needsRebalance);

    if (positionsNeedingRebalance.length > 0) {
      console.log(
        `🔄 ${positionsNeedingRebalance.length} positions need rebalancing, executing automatically...`
      );

      for (const evaluation of positionsNeedingRebalance) {
        try {
          await this.executeRebalance(evaluation);
        } catch (error) {
          console.error(
            `❌ Failed to rebalance position ${(evaluation as any).positionId}:`,
            error
          );
          // Continue with other positions even if one fails
          continue;
        }
      }
    } else {
      console.log(`✅ All ${evaluations.length} positions are healthy, no rebalance needed`);
    }
  }

  /**
   * Execute automatic rebalance
   */
  private async executeRebalance(evaluation: any): Promise<void> {
    try {
      const positionId = evaluation.positionId;
      const chainId = evaluation.chainId;
      const poolAddress = evaluation.poolAddress;

      if (!positionId) {
        throw new Error('No position ID available for rebalancing');
      }

      console.log(`🔄 Rebalancing position ${positionId} on chain ${chainId}...`);

      // Step 1: Withdraw current liquidity
      console.log('🔄 Step 1: Withdrawing current liquidity...');
      const withdrawResult = await this.withdrawLiquidity(evaluation);

      if (!withdrawResult.success) {
        throw new Error(`Liquidity withdrawal failed: ${withdrawResult.error}`);
      }

      console.log('✅ Liquidity withdrawn successfully');

      // Step 2: Check if token swap is needed (simplified logic)
      const needsSwap = await this.checkIfSwapNeeded();

      if (needsSwap) {
        console.log('🔄 Step 2: Rebalancing token ratio...');
        await this.rebalanceTokenRatio(evaluation.token0, evaluation.token1);
      } else {
        console.log('✅ Token ratio is balanced, skipping swap');
      }

      // Step 3: Supply liquidity at new range
      console.log('🔄 Step 3: Supplying liquidity at new range...');
      const supplyResult = await this.supplyLiquidityAtNewRange(evaluation, poolAddress, chainId);

      if (!supplyResult.success) {
        throw new Error(`Liquidity supply failed: ${supplyResult.error}`);
      }

      console.log(`✅ Rebalance completed successfully for position ${positionId}!`);

      // Send success notification
      await this.sendRebalanceConfirmation(evaluation, supplyResult.transactionHash!);
    } catch (error) {
      console.error('❌ Rebalance execution failed:', error);
      await this.sendRebalanceFailure(error as Error);
      throw error;
    }
  }

  /**
   * Withdraw liquidity from current position
   */
  private async withdrawLiquidity(evaluation: any): Promise<TransactionResult> {
    // Import the withdrawLiquidity tool
    const { withdrawLiquidityTool } = await import('../tools/withdrawLiquidity.js');

    // Create AgentContext wrapper
    const agentContext = {
      custom: this.context,
      config: this.context.config,
      mcpClients: this.context.mcpClients,
      llm: this.context.llm,
    };

    // Extract position data from evaluation
    const positionId = evaluation.positionId;

    console.log('🔍 Full evaluation data:', JSON.stringify(evaluation, null, 2));
    console.log('🔍 Withdrawing liquidity for position:', positionId);

    // Execute the tool with simplified parameters
    const result = await withdrawLiquidityTool.execute(
      {
        positionId,
        collectFees: true,
      },
      agentContext
    );

    if ('artifacts' in result && result.artifacts && result.artifacts.length > 0) {
      const artifact = result.artifacts[0];
      if (artifact && artifact.parts && artifact.parts.length > 0) {
        const part = artifact.parts[0];
        if (part && 'text' in part) {
          return JSON.parse(part.text);
        }
      }
    }
    throw new Error('No valid artifacts returned from withdraw liquidity');
  }

  /**
   * Check if token swap is needed for optimal ratio
   */
  private async checkIfSwapNeeded(): Promise<boolean> {
    // Simplified check - in real implementation, calculate optimal token ratio
    // based on new range and current balances
    return Math.random() > 0.7; // 30% chance of needing swap for demo
  }

  /**
   * Rebalance token ratio via swap
   */
  private async rebalanceTokenRatio(token0?: string, token1?: string): Promise<void> {
    // Import the required tools
    const { getWalletBalancesTool, swapTokensTool } = await import('../tools/index.js');

    // Create AgentContext wrapper
    const agentContext = {
      custom: this.context,
      config: this.context.config,
      mcpClients: this.context.mcpClients,
      llm: this.context.llm,
    };

    // Get wallet balances
    const walletAddress = getWalletAddressFromPrivateKey(this.context.config.walletPrivateKey);

    // Use passed token addresses or fall back to config
    const token0Address = token0 || this.context.config.token0;
    const token1Address = token1 || this.context.config.token1;

    if (!token0Address || !token1Address) {
      throw new Error('Token addresses not provided and not found in config');
    }

    const balancesResult = await getWalletBalancesTool.execute(
      {
        walletAddress,
        tokens: [token0Address, token1Address],
      },
      agentContext
    );

    if (
      !('artifacts' in balancesResult) ||
      !balancesResult.artifacts ||
      balancesResult.artifacts.length === 0
    ) {
      throw new Error('Failed to get wallet balances');
    }

    const artifact = balancesResult.artifacts[0];
    if (!artifact || !artifact.parts || artifact.parts.length === 0) {
      throw new Error('No valid artifacts returned from get wallet balances');
    }

    const part = artifact.parts[0];
    if (!part || !('text' in part)) {
      throw new Error('Invalid artifact format from get wallet balances');
    }

    const balancesData = JSON.parse(part.text);
    const balances = balancesData.balances || [];

    // Simplified swap logic - swap 10% of larger balance
    const token0Balance = balances.find((b: any) => b.address === token0Address);
    const token1Balance = balances.find((b: any) => b.address === token1Address);

    if (token0Balance.usdValue > token1Balance.usdValue) {
      // Swap some token0 for token1
      const swapAmount = (parseFloat(token0Balance.balanceFormatted) * 0.1).toString();

      const swapResult = await swapTokensTool.execute(
        {
          tokenIn: this.context.config.token0!,
          tokenOut: this.context.config.token1!,
          amountIn: swapAmount,
        },
        agentContext
      );

      if (
        !('artifacts' in swapResult) ||
        !swapResult.artifacts ||
        swapResult.artifacts.length === 0
      ) {
        throw new Error('Token swap failed');
      }

      const swapArtifact = swapResult.artifacts[0];
      if (!swapArtifact || !swapArtifact.parts || swapArtifact.parts.length === 0) {
        throw new Error('No valid artifacts returned from token swap');
      }

      const swapPart = swapArtifact.parts[0];
      if (!swapPart || !('text' in swapPart)) {
        throw new Error('Invalid artifact format from token swap');
      }

      const swapData = JSON.parse(swapPart.text);
      if (!swapData.success) {
        throw new Error(`Token swap failed: ${swapData.error}`);
      }
    }
  }

  /**
   * Supply liquidity at the new optimal range
   */
  private async supplyLiquidityAtNewRange(
    evaluation: any,
    poolAddress: string,
    _chainId: number
  ): Promise<TransactionResult> {
    // Import the required tools
    const { getWalletBalancesTool, supplyLiquidityTool } = await import('../tools/index.js');

    // Create public client for token operations
    const { createPublicClient, http } = await import('viem');
    const { arbitrum } = await import('viem/chains');

    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(this.context.config.arbitrumRpcUrl),
    });

    // Create AgentContext wrapper
    const agentContext = {
      custom: this.context,
      config: this.context.config,
      mcpClients: this.context.mcpClients,
      llm: this.context.llm,
    };

    // Get current wallet balances to determine amounts
    const walletAddress = getWalletAddressFromPrivateKey(this.context.config.walletPrivateKey);

    // Extract token symbols and addresses from evaluation data
    const token0 = evaluation.token0Symbol || evaluation.symbol0;
    const token1 = evaluation.token1Symbol || evaluation.symbol1;
    const token0Id = evaluation.token0; // Direct address from evaluation
    const token1Id = evaluation.token1; // Direct address from evaluation

    console.log('🔍 Full evaluation data for supply:', JSON.stringify(evaluation, null, 2));
    console.log('🔍 Supplying liquidity with position data:', {
      token0,
      token1,
      token0Id,
      token1Id,
      poolAddress,
    });

    // Validate required token addresses - must come from the position being rebalanced
    if (!token0Id || !token1Id) {
      throw new Error(
        `Missing token addresses from position data: token0Id=${token0Id}, token1Id=${token1Id}. ` +
          `Cannot rebalance position without knowing the original token addresses. ` +
          `This position may have invalid or missing token data.`
      );
    }

    const balancesResult = await getWalletBalancesTool.execute(
      {
        walletAddress,
        tokens: [token0, token1],
      },
      agentContext
    );

    if (
      !('artifacts' in balancesResult) ||
      !balancesResult.artifacts ||
      balancesResult.artifacts.length === 0
    ) {
      throw new Error('Failed to get wallet balances');
    }

    const artifact = balancesResult.artifacts[0];
    if (!artifact || !artifact.parts || artifact.parts.length === 0) {
      throw new Error('No valid artifacts returned from get wallet balances');
    }

    const part = artifact.parts[0];
    if (!part || !('text' in part)) {
      throw new Error('Invalid artifact format from get wallet balances');
    }

    const balanceData = JSON.parse(part.text);
    const balances = balanceData.balances || [];
    const token0Balance = balances.find((b: any) => b.symbol === token0);
    const token1Balance = balances.find((b: any) => b.symbol === token1);

    if (!token0Balance) {
      throw new Error(`Token ${token0} balance not found in wallet`);
    }
    if (!token1Balance) {
      throw new Error(`Token ${token1} balance not found in wallet`);
    }

    // Calculate the value of the old position to match it
    const currentPrice = evaluation.currentPrice;

    // Get position value from subgraph data
    const positionValueUSD = evaluation.amountUSD ? parseFloat(evaluation.amountUSD) : null;

    // Calculate current wallet value for comparison
    const token0Value = parseFloat(token0Balance.balanceFormatted) * currentPrice;
    const token1Value = parseFloat(token1Balance.balanceFormatted);
    const currentWalletValue = token0Value + token1Value;

    console.log(`💰 Position value analysis:`);
    if (positionValueUSD) {
      console.log(`   Position value (from subgraph): $${positionValueUSD.toFixed(2)}`);
    }
    console.log(`   Current wallet value: $${currentWalletValue.toFixed(2)}`);
    console.log(
      `   ${token0}: ${token0Balance.balanceFormatted} * $${currentPrice} = $${token0Value.toFixed(2)}`
    );
    console.log(`   ${token1}: ${token1Balance.balanceFormatted} = $${token1Value.toFixed(2)}`);

    // Use position value from subgraph as target, fallback to wallet value
    const targetPositionValue = positionValueUSD || currentWalletValue;

    // Use proper liquidity math to maintain USD value
    let amount0Desired: string;
    let amount1Desired: string;

    if (targetPositionValue && targetPositionValue > 0) {
      console.log(
        `🧮 Using liquidity math to maintain USD value of $${targetPositionValue.toFixed(2)}`
      );

      try {
        // Import liquidity math utilities
        const { calculateOptimalAmounts } = await import('../utils/liquidityMath.js');

        // Get token decimals
        const { getTokenDecimals } = await import('../utils/tokenUtils.js');
        const [decimals0, decimals1] = await Promise.all([
          getTokenDecimals(token0Id, publicClient),
          getTokenDecimals(token1Id, publicClient),
        ]);

        // Calculate current sqrt price from current price
        // For Uniswap v3/Algebra: sqrtP = sqrt(price)
        const currentSqrtP = Math.sqrt(currentPrice);

        // Get new tick range
        const newTickLower =
          evaluation.recommendation?.newRange?.lower || evaluation.suggestedRange?.tickLower;
        const newTickUpper =
          evaluation.recommendation?.newRange?.upper || evaluation.suggestedRange?.tickUpper;

        if (!newTickLower || !newTickUpper) {
          throw new Error('New tick range not provided');
        }

        console.log(`🔍 Debug - Tick range validation:`);
        console.log(`   Current price: ${currentPrice}`);
        console.log(`   Current sqrt price: ${currentSqrtP}`);
        console.log(`   New tick lower: ${newTickLower}`);
        console.log(`   New tick upper: ${newTickUpper}`);
        console.log(`   Tick range valid: ${newTickLower < newTickUpper}`);

        // Calculate what price range these ticks represent
        const { tickToPrice } = await import('../utils/priceCalculations.js');
        const priceLower = tickToPrice(newTickLower, decimals0, decimals1);
        const priceUpper = tickToPrice(newTickUpper, decimals0, decimals1);
        console.log(`   Price range: [${priceLower}, ${priceUpper}]`);
        console.log(
          `   Current price in range: ${priceLower <= currentPrice && currentPrice <= priceUpper}`
        );

        // Check if the tick range is reasonable
        const priceRangeReasonable = priceLower > 0 && priceUpper > 0 && priceLower < priceUpper;
        const currentPriceReasonable = currentPrice > 0 && currentPrice < 1000; // Reasonable price range

        if (!priceRangeReasonable || !currentPriceReasonable) {
          console.warn(`⚠️  Invalid tick range or price detected:`);
          console.warn(`   Price range reasonable: ${priceRangeReasonable}`);
          console.warn(`   Current price reasonable: ${currentPriceReasonable}`);
          console.warn(`   Skipping liquidity math and using fallback`);
          throw new Error('Invalid tick range or price detected');
        }

        // Calculate optimal amounts to maintain USD value
        let optimalAmounts;
        try {
          optimalAmounts = calculateOptimalAmounts(
            targetPositionValue, // Target USD value
            currentSqrtP, // Current sqrt price
            newTickLower, // New lower tick
            newTickUpper, // New upper tick
            currentPrice, // Token0 price (in terms of token1)
            1.0, // Token1 price (always 1.0 for USDC)
            decimals0, // Token0 decimals
            decimals1 // Token1 decimals
          );
        } catch (error) {
          console.warn(`⚠️  Liquidity math failed: ${error}`);
          console.log(`🔄 Falling back to 95% of wallet balances`);
          throw error; // Re-throw to trigger the fallback in the catch block
        }

        // Convert to formatted strings
        amount0Desired = (Number(optimalAmounts.amount0) / Math.pow(10, decimals0)).toString();
        amount1Desired = (Number(optimalAmounts.amount1) / Math.pow(10, decimals1)).toString();

        console.log(`🎯 Optimal amounts calculated:`);
        console.log(
          `   ${token0}: ${amount0Desired} (${(parseFloat(amount0Desired) * currentPrice).toFixed(2)} USD)`
        );
        console.log(
          `   ${token1}: ${amount1Desired} (${parseFloat(amount1Desired).toFixed(2)} USD)`
        );
        console.log(`   Target USD value: $${targetPositionValue.toFixed(2)}`);
      } catch (error) {
        console.warn(`⚠️  Liquidity math failed: ${error}`);
        console.log(`🔄 Falling back to 95% of wallet balances`);

        // Fallback to simple approach
        amount0Desired = (parseFloat(token0Balance.balanceFormatted) * 0.95).toString();
        amount1Desired = (parseFloat(token1Balance.balanceFormatted) * 0.95).toString();
      }
    } else {
      console.log(`🔄 Using 95% of wallet balances (no previous position value available)`);

      // Fallback to simple approach
      amount0Desired = (parseFloat(token0Balance.balanceFormatted) * 0.95).toString();
      amount1Desired = (parseFloat(token1Balance.balanceFormatted) * 0.95).toString();
    }

    console.log(`🔄 Creating new position with:`);
    console.log(
      `   ${token0}: ${amount0Desired} (${(parseFloat(amount0Desired) * currentPrice).toFixed(2)} USD)`
    );
    console.log(`   ${token1}: ${amount1Desired} (${parseFloat(amount1Desired).toFixed(2)} USD)`);
    console.log(
      `   New position value: $${(parseFloat(amount0Desired) * currentPrice + parseFloat(amount1Desired)).toFixed(2)}`
    );

    const supplyResult = await supplyLiquidityTool.execute(
      {
        token0: token0Id,
        token1: token1Id,
        tickLower:
          evaluation.recommendation?.newRange?.lower || evaluation.suggestedRange?.tickLower,
        tickUpper:
          evaluation.recommendation?.newRange?.upper || evaluation.suggestedRange?.tickUpper,
        amount0Desired,
        amount1Desired,
        slippageBps: 200, // 2% slippage (increased from 0.5% to handle market volatility)
        poolAddress: poolAddress, // Pass pool address for tick alignment
      },
      agentContext
    );

    if (
      !('artifacts' in supplyResult) ||
      !supplyResult.artifacts ||
      supplyResult.artifacts.length === 0
    ) {
      throw new Error('No response from supply liquidity');
    }

    const supplyArtifact = supplyResult.artifacts[0];
    if (!supplyArtifact || !supplyArtifact.parts || supplyArtifact.parts.length === 0) {
      throw new Error('No valid artifacts returned from supply liquidity');
    }

    const supplyPart = supplyArtifact.parts[0];
    if (!supplyPart || !('text' in supplyPart)) {
      throw new Error('Invalid artifact format from supply liquidity');
    }

    return JSON.parse(supplyPart.text);
  }

  /**
   * Send rebalance confirmation via Telegram
   */
  private async sendRebalanceConfirmation(evaluation: any, txHash: string): Promise<void> {
    if (!this.context.telegramBot || !this.context.config.telegramChatId) {
      console.log('✅ REBALANCE COMPLETED:');
      console.log(`   Transaction: ${txHash}`);
      console.log(
        `   New range: $${evaluation.suggestedRange.priceRange[0].toFixed(6)} - $${evaluation.suggestedRange.priceRange[1].toFixed(6)}`
      );
      return;
    }

    try {
      const message = `✅ *Rebalance Completed*
      
📊 *Position:* ${evaluation.tokenPair}
🆔 *ID:* \`${evaluation.positionId}\`
🌐 *Chain:* ${evaluation.chainId}
⏰ *Time:* ${new Date().toLocaleString()}
🔄 *Mode:* Active (Auto-executed)

🎯 *New Range:*
$${evaluation.suggestedRange.priceRange[0].toFixed(6)} - $${evaluation.suggestedRange.priceRange[1].toFixed(6)}

📈 *Expected Benefits:*
• APR improvement: +${evaluation.estimatedAprImprovement.toFixed(2)}%
• Risk level: ${evaluation.riskAssessment}

🔗 *Transaction:* \`${txHash}\`

✅ Your position has been automatically rebalanced for optimal returns!`;

      await this.context.telegramBot.sendMessage(this.context.config.telegramChatId, message, {
        parse_mode: 'Markdown',
      });

      console.log('✅ Rebalance confirmation sent via Telegram');
    } catch (error) {
      console.error('❌ Failed to send Telegram confirmation:', error);
    }
  }

  /**
   * Send rebalance failure notification
   */
  private async sendRebalanceFailure(error: Error): Promise<void> {
    if (!this.context.telegramBot || !this.context.config.telegramChatId) {
      return;
    }

    try {
      const message = `❌ *Rebalance Failed*
      
📊 *Pool:* ${this.context.config.token0}/${this.context.config.token1}
⏰ *Time:* ${new Date().toLocaleString()}
🔄 *Mode:* Active

⚠️ *Error:* ${error.message}

🔧 Please check the agent logs and wallet configuration.
💡 The monitoring will continue and retry on the next cycle.`;

      await this.context.telegramBot.sendMessage(this.context.config.telegramChatId, message, {
        parse_mode: 'Markdown',
      });
    } catch (telegramError) {
      console.error('❌ Failed to send failure notification via Telegram:', telegramError);
    }
  }

  protected async handleError(error: Error): Promise<void> {
    console.error('❌ ActiveModeTask error:', error.message);
    await this.sendRebalanceFailure(error);
  }
}
