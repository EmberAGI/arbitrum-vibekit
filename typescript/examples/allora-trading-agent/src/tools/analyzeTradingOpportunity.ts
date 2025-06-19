/**
 * Analyze Trading Opportunity Tool
 * Analyzes market predictions to determine if a trade should be executed
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask, VibkitError } from 'arbitrum-vibekit-core';
import { assessRisk, DEFAULT_RISK_PARAMS } from '../utils/riskAssessment.js';

// Helper function to provide general analysis when no price data is available
function getGeneralTokenAnalysis(token: string): {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  expectedChange: number;
  estimatedPrice: number;
} {
  // Provide conservative general analysis based on token
  const tokenUpper = token.toUpperCase();

  // Default to HOLD with low confidence when no data available
  let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  let confidence = 0.3;
  let expectedChange = 0;
  let estimatedPrice = 1000; // Default placeholder

  // Set rough price estimates for major tokens
  if (tokenUpper === 'BTC' || tokenUpper === 'BITCOIN') {
    estimatedPrice = 100000;
    recommendation = 'HOLD';
    confidence = 0.4;
  } else if (tokenUpper === 'ETH' || tokenUpper === 'ETHEREUM') {
    estimatedPrice = 2500;
    recommendation = 'HOLD';
    confidence = 0.4;
  } else if (tokenUpper === 'USDC' || tokenUpper === 'USDT') {
    estimatedPrice = 1;
    recommendation = 'HOLD';
    confidence = 0.9;
  }

  return { recommendation, confidence, expectedChange, estimatedPrice };
}

// Tool parameters schema
const AnalyzeTradingOpportunityParams = z.object({
  token: z.string().describe('Token symbol to analyze'),
  predictionPrice: z.number().optional().describe('Predicted price from forecast'),
  currentPrice: z.number().optional().describe('Current market price'),
  tradeAmount: z.number().optional().default(100).describe('Amount in USD to potentially trade'),
  userAddress: z.string().optional().describe('User wallet address for personalized analysis'),
  portfolioValue: z.number().optional().default(10000).describe('Total portfolio value for risk assessment'),
});

export const analyzeTradingOpportunityTool: VibkitToolDefinition<
  typeof AnalyzeTradingOpportunityParams,
  any,
  any,
  any
> = {
  name: 'analyze-trading-opportunity',
  description: 'Analyze if a token is a good trading opportunity based on market predictions and risk assessment',
  parameters: AnalyzeTradingOpportunityParams,

  execute: async (args, context) => {
    console.log('[AnalyzeTradingOpportunity] Analyzing:', args);

    const { token, predictionPrice, currentPrice, tradeAmount, userAddress, portfolioValue } = args;

    // If we have prediction data, use it for analysis
    let priceChangePercent = 0;
    let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0.5;
    let actualPredictionPrice = predictionPrice;
    let actualCurrentPrice = currentPrice;

    if (predictionPrice && currentPrice) {
      priceChangePercent = ((predictionPrice - currentPrice) / currentPrice) * 100;

      // Simple trading logic based on price change
      if (priceChangePercent > 3) {
        recommendation = 'BUY';
        confidence = Math.min(0.9, 0.6 + priceChangePercent / 100);
      } else if (priceChangePercent < -3) {
        recommendation = 'SELL';
        confidence = Math.min(0.9, 0.6 + Math.abs(priceChangePercent) / 100);
      } else {
        recommendation = 'HOLD';
        confidence = 0.4;
      }
    } else if (predictionPrice) {
      // If we only have prediction price, assume current price is slightly lower
      actualCurrentPrice = predictionPrice * 0.97;
      priceChangePercent = ((predictionPrice - actualCurrentPrice) / actualCurrentPrice) * 100;
      recommendation = 'BUY';
      confidence = 0.7;
    } else {
      // No price data provided - provide a general analysis
      console.log('[AnalyzeTradingOpportunity] No price data provided, giving general analysis');

      // Provide a general recommendation based on the token
      const generalAnalysis = getGeneralTokenAnalysis(token);
      recommendation = generalAnalysis.recommendation;
      confidence = generalAnalysis.confidence;
      priceChangePercent = generalAnalysis.expectedChange;

      // Use placeholder prices for display
      actualPredictionPrice = generalAnalysis.estimatedPrice;
      actualCurrentPrice = generalAnalysis.estimatedPrice * 0.98;
    }

    // Perform risk assessment
    const riskAssessment = assessRisk({
      token,
      tradeAmount,
      portfolioValue,
      confidence,
      volatility: Math.abs(priceChangePercent) / 100,
    });

    // Create analysis summary
    const analysis = {
      token,
      recommendation,
      confidence,
      priceChangePercent,
      suggestedPositionSize: riskAssessment.suggestedPositionSize,
      riskLevel: riskAssessment.riskLevel,
      warnings: riskAssessment.warnings,
      predictionPrice: actualPredictionPrice,
      currentPrice: actualCurrentPrice,
    };

    // Format the response
    let message = `📊 **Trading Analysis for ${token}**\n\n`;
    message += `**Recommendation:** ${recommendation}\n`;
    message += `**Confidence:** ${(confidence * 100).toFixed(0)}%\n`;
    message += `**Expected Price Change:** ${priceChangePercent > 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%\n\n`;

    if (actualPredictionPrice) {
      message += `**Predicted Price:** $${actualPredictionPrice.toFixed(2)}\n`;
      message += `**Current Price:** $${(actualCurrentPrice || actualPredictionPrice * 0.98).toFixed(2)}\n\n`;
    }

    message += `**Risk Assessment:**\n`;
    message += `• Risk Level: ${riskAssessment.riskLevel}\n`;
    message += `• Suggested Position: $${riskAssessment.suggestedPositionSize.toFixed(2)}\n`;

    if (riskAssessment.warnings.length > 0) {
      message += `\n**Warnings:**\n`;
      riskAssessment.warnings.forEach((warning: string) => {
        message += `• ${warning}\n`;
      });
    }

    if (recommendation !== 'HOLD') {
      message += `\n💡 **Next Step:** `;
      if (recommendation === 'BUY') {
        message += `Consider buying ${token} with the suggested position size.`;
      } else {
        message += `Consider selling ${token} to lock in profits or minimize losses.`;
      }

      if (userAddress) {
        message += ` Ready to execute the trade.`;
      } else {
        message += ` Provide your wallet address to execute.`;
      }
    }

    return createSuccessTask('analyze-opportunity', undefined, message);
  },
};
