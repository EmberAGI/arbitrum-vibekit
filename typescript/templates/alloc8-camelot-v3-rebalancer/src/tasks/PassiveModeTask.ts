/**
 * Passive Mode Task - Monitors positions and sends alerts via Telegram
 */

import { BaseRebalanceTask } from './BaseRebalanceTask.js';
import type { RebalancerContext } from '../context/types.js';

export class PassiveModeTask extends BaseRebalanceTask {
  constructor(context: RebalancerContext) {
    super(context);
  }

  public getTaskName(): string {
    return 'PassiveModeTask';
  }

  protected async run(): Promise<void> {
    const evaluations = await this.fetchAndEvaluate();

    if (evaluations.length === 0) {
      console.log('ℹ️  No positions to evaluate');
      return;
    }

    // Check each position and send alerts for those needing rebalance
    const positionsNeedingRebalance = evaluations.filter(e => e.needsRebalance);

    if (positionsNeedingRebalance.length > 0) {
      console.log(`🚨 ${positionsNeedingRebalance.length} positions need rebalancing`);

      for (const evaluation of positionsNeedingRebalance) {
        await this.sendRebalanceAlert(evaluation);
      }
    } else {
      console.log(`✅ All ${evaluations.length} positions are healthy, no rebalance needed`);
    }
  }

  /**
   * Send rebalance alert via Telegram
   */
  private async sendRebalanceAlert(evaluation: any): Promise<void> {
    if (!this.context.telegramBot || !this.context.config.telegramChatId) {
      console.log('⚠️  Telegram not configured, logging alert instead:');
      console.log('🚨 REBALANCE ALERT:');
      console.log(`   Position: ${evaluation.positionId}`);
      console.log(`   Pool: ${evaluation.poolAddress}`);
      console.log(
        `   Reason: ${evaluation.recommendation?.reasoning || 'Position needs rebalancing'}`
      );

      // Convert ticks to prices for display
      const currentLowerPrice = Math.pow(1.0001, evaluation.currentRange.lower);
      const currentUpperPrice = Math.pow(1.0001, evaluation.currentRange.upper);
      console.log(
        `   Current range: $${currentLowerPrice.toFixed(6)} - $${currentUpperPrice.toFixed(6)}`
      );

      if (evaluation.recommendation?.newRange) {
        const suggestedLowerPrice = Math.pow(1.0001, evaluation.recommendation.newRange.lower);
        const suggestedUpperPrice = Math.pow(1.0001, evaluation.recommendation.newRange.upper);
        console.log(
          `   Suggested range: $${suggestedLowerPrice.toFixed(6)} - $${suggestedUpperPrice.toFixed(6)}`
        );
      }

      console.log(`   Current price: $${evaluation.currentPrice.toFixed(6)}`);
      console.log(`   Price deviation: ${(evaluation.priceDeviation * 100).toFixed(2)}%`);
      console.log(
        `   Confidence: ${evaluation.recommendation ? (evaluation.recommendation.confidence * 100).toFixed(1) + '%' : 'N/A'}`
      );
      return;
    }

    try {
      const message = this.formatTelegramMessage(evaluation);

      await this.context.telegramBot.sendMessage(this.context.config.telegramChatId!, message, {
        parse_mode: 'Markdown',
      });

      console.log('✅ Rebalance alert sent via Telegram');
    } catch (error) {
      console.error('❌ Failed to send Telegram alert:', error);
      // Fallback to console logging
      console.log('🚨 REBALANCE ALERT (Telegram failed):');
      console.log(`   Position: ${evaluation.positionId}`);
      console.log(`   Pool: ${evaluation.poolAddress}`);
      console.log(
        `   Reason: ${evaluation.recommendation?.reasoning || 'Position needs rebalancing'}`
      );
    }
  }

  /**
   * Format message for Telegram
   */
  private formatTelegramMessage(evaluation: any): string {
    const timestamp = new Date().toLocaleString();

    // Convert ticks to prices for display
    const currentLowerPrice = Math.pow(1.0001, evaluation.currentRange.lower);
    const currentUpperPrice = Math.pow(1.0001, evaluation.currentRange.upper);

    const suggestedLowerPrice = evaluation.recommendation?.newRange
      ? Math.pow(1.0001, evaluation.recommendation.newRange.lower)
      : 0;
    const suggestedUpperPrice = evaluation.recommendation?.newRange
      ? Math.pow(1.0001, evaluation.recommendation.newRange.upper)
      : 0;

    return `🚨 *LP Rebalance Alert*
    
📊 *Position:* ${evaluation.positionId}
🆔 *ID:* \`${evaluation.positionId}\`
📍 *Pool:* \`${evaluation.poolAddress.slice(0, 10)}...\`
⏰ *Time:* ${timestamp}
🔍 *Mode:* Passive (Alert Only)

⚠️ *Reason:* ${evaluation.recommendation?.reasoning || 'Position needs rebalancing'}

📈 *Current Range:*
$${currentLowerPrice.toFixed(6)} - $${currentUpperPrice.toFixed(6)}

🎯 *Suggested Range:*
$${suggestedLowerPrice.toFixed(6)} - $${suggestedUpperPrice.toFixed(6)}

💰 *Analysis:*
• Current Price: $${evaluation.currentPrice.toFixed(6)}
• Price Deviation: ${(evaluation.priceDeviation * 100).toFixed(2)}%
• In Range: ${evaluation.isInRange ? '✅' : '❌'}
• Confidence: ${evaluation.recommendation ? (evaluation.recommendation.confidence * 100).toFixed(1) + '%' : 'N/A'}

💡 *Next Steps:*
Consider rebalancing your position to the suggested range for optimal returns.`;
  }

  protected async handleError(error: Error): Promise<void> {
    console.error('❌ PassiveModeTask error:', error.message);

    // Send error notification if Telegram is configured
    if (this.context.telegramBot && this.context.config.telegramChatId) {
      try {
        const errorMessage = `🚨 *Rebalancer Error*
        
⚠️ The LP rebalancing monitor encountered an error:
\`${error.message}\`

🔧 Please check the agent logs and configuration.
⏰ Time: ${new Date().toLocaleString()}`;

        await this.context.telegramBot.sendMessage(
          this.context.config.telegramChatId,
          errorMessage,
          { parse_mode: 'Markdown' }
        );
      } catch (telegramError) {
        console.error('❌ Failed to send error notification via Telegram:', telegramError);
      }
    }
  }
}
