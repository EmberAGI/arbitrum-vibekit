/**
 * Risk Assessment Utility - Evaluates trading risks and manages position sizing
 * Implements conservative risk management strategies
 */

export interface RiskParameters {
  maxPositionSizePercent: number; // Maximum % of portfolio per trade
  defaultSlippagePercent: number; // Default slippage tolerance
  minConfidenceScore: number; // Minimum confidence to recommend trade
  maxVolatilityPercent: number; // Maximum acceptable volatility
}

export interface TradingOpportunity {
  token: string;
  currentPrice: number;
  predictedPrice: number;
  timeHorizon: string;
  confidence: number;
  investmentAmount?: number;
}

export interface RiskAssessment {
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedPositionSize: number;
  expectedReturn: number;
  riskRewardRatio: number;
  warnings: string[];
}

// Default risk parameters
export const DEFAULT_RISK_PARAMS: RiskParameters = {
  maxPositionSizePercent: 5, // Max 5% of portfolio per trade
  defaultSlippagePercent: 1, // 1% default slippage
  minConfidenceScore: 0.6, // 60% minimum confidence
  maxVolatilityPercent: 20, // 20% max volatility tolerance
};

/**
 * Assess trading opportunity based on prediction data
 */
export function assessTradingOpportunity(
  opportunity: TradingOpportunity,
  portfolioValue: number = 10000, // Default $10k portfolio
  riskParams: RiskParameters = DEFAULT_RISK_PARAMS,
): RiskAssessment {
  const warnings: string[] = [];

  // Calculate price change percentage
  const priceChangePercent = ((opportunity.predictedPrice - opportunity.currentPrice) / opportunity.currentPrice) * 100;
  const absoluteChange = Math.abs(priceChangePercent);

  // Determine recommendation based on price change
  let recommendation: 'BUY' | 'SELL' | 'HOLD';
  if (priceChangePercent > 3) {
    recommendation = 'BUY';
  } else if (priceChangePercent < -3) {
    recommendation = 'SELL';
  } else {
    recommendation = 'HOLD';
    warnings.push('Price change less than 3% - consider holding');
  }

  // Assess confidence level
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  if (opportunity.confidence >= 0.8) {
    confidence = 'HIGH';
  } else if (opportunity.confidence >= 0.6) {
    confidence = 'MEDIUM';
  } else {
    confidence = 'LOW';
    warnings.push('Low prediction confidence - trade with caution');
  }

  // Determine risk level based on volatility
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  if (absoluteChange < 5) {
    riskLevel = 'LOW';
  } else if (absoluteChange < 15) {
    riskLevel = 'MEDIUM';
  } else {
    riskLevel = 'HIGH';
    warnings.push('High volatility detected - consider smaller position size');
  }

  // Calculate suggested position size
  const maxPosition = portfolioValue * (riskParams.maxPositionSizePercent / 100);
  let suggestedPositionSize = opportunity.investmentAmount || maxPosition;

  // Adjust position size based on confidence and risk
  if (confidence === 'LOW') {
    suggestedPositionSize *= 0.5; // Halve position for low confidence
  } else if (confidence === 'MEDIUM') {
    suggestedPositionSize *= 0.75; // Reduce by 25% for medium confidence
  }

  if (riskLevel === 'HIGH') {
    suggestedPositionSize *= 0.5; // Halve position for high risk
  } else if (riskLevel === 'MEDIUM') {
    suggestedPositionSize *= 0.8; // Reduce by 20% for medium risk
  }

  // Ensure position doesn't exceed max allowed
  suggestedPositionSize = Math.min(suggestedPositionSize, maxPosition);

  // Calculate expected return
  const expectedReturn = suggestedPositionSize * (priceChangePercent / 100);

  // Calculate risk-reward ratio (simplified)
  const potentialLoss = suggestedPositionSize * 0.05; // Assume 5% stop loss
  const riskRewardRatio = Math.abs(expectedReturn) / potentialLoss;

  // Add warnings for poor risk-reward
  if (riskRewardRatio < 2 && recommendation !== 'HOLD') {
    warnings.push('Risk-reward ratio below 2:1 - consider waiting for better entry');
  }

  return {
    recommendation,
    confidence,
    riskLevel,
    suggestedPositionSize: Math.round(suggestedPositionSize * 100) / 100,
    expectedReturn: Math.round(expectedReturn * 100) / 100,
    riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
    warnings,
  };
}

/**
 * Calculate position size based on risk parameters
 */
export function calculatePositionSize(
  portfolioValue: number,
  riskPercent: number = DEFAULT_RISK_PARAMS.maxPositionSizePercent,
): number {
  return portfolioValue * (riskPercent / 100);
}

/**
 * Validate trade parameters
 */
export function validateTradeParameters(
  amount: number,
  slippage: number,
  userAddress: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (amount <= 0) {
    errors.push('Trade amount must be greater than 0');
  }

  if (slippage < 0.1 || slippage > 50) {
    errors.push('Slippage must be between 0.1% and 50%');
  }

  if (!userAddress || !userAddress.startsWith('0x') || userAddress.length !== 42) {
    errors.push('Invalid user address format');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format risk assessment for user display
 */
export function formatRiskAssessment(assessment: RiskAssessment): string {
  const lines = [
    `📈 Trading Recommendation: ${assessment.recommendation}`,
    `   • Confidence: ${assessment.confidence}`,
    `   • Risk Level: ${assessment.riskLevel}`,
    `   • Suggested Position: $${assessment.suggestedPositionSize.toFixed(2)}`,
    `   • Expected Return: ${assessment.expectedReturn > 0 ? '+' : ''}${(assessment.expectedReturn * 100).toFixed(1)}%`,
    `   • Risk/Reward Ratio: ${assessment.riskRewardRatio.toFixed(2)}`,
  ];

  if (assessment.warnings.length > 0) {
    lines.push('', '⚠️  Risk Warnings:');
    assessment.warnings.forEach((warning) => {
      lines.push(`   • ${warning}`);
    });
  }

  return lines.join('\n');
}

/**
 * Simplified risk assessment for the updated trading analysis
 */
export function assessRisk(params: {
  token: string;
  tradeAmount: number;
  portfolioValue: number;
  confidence: number;
  volatility: number;
}): {
  suggestedPositionSize: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  warnings: string[];
} {
  const { token, tradeAmount, portfolioValue, confidence, volatility } = params;
  const warnings: string[] = [];

  // Calculate suggested position size based on risk
  const maxPosition = portfolioValue * (DEFAULT_RISK_PARAMS.maxPositionSizePercent / 100);
  let suggestedPositionSize = Math.min(tradeAmount, maxPosition);

  // Adjust based on confidence
  if (confidence < 0.6) {
    suggestedPositionSize *= 0.5;
    warnings.push('Low confidence - position size reduced');
  }

  // Determine risk level
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  if (volatility > 0.1 || confidence < 0.5) {
    riskLevel = 'HIGH';
  } else if (volatility < 0.03 && confidence > 0.8) {
    riskLevel = 'LOW';
  }

  // Add warnings based on conditions
  if (volatility > DEFAULT_RISK_PARAMS.maxVolatilityPercent) {
    warnings.push('High volatility detected');
  }

  if (suggestedPositionSize > portfolioValue * 0.1) {
    warnings.push('Large position relative to portfolio');
  }

  return {
    suggestedPositionSize,
    riskLevel,
    warnings,
  };
}
