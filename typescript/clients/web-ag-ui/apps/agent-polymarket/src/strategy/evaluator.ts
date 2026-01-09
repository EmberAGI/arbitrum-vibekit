/**
 * Polymarket Strategy - Position Evaluator
 *
 * Evaluates arbitrage opportunities and calculates optimal position sizes.
 */

import type { ArbitrageOpportunity, StrategyConfig } from '../workflow/context.js';
import { logInfo } from '../workflow/context.js';

/**
 * Calculated position size for an arbitrage trade.
 */
export interface PositionSize {
  /** Number of YES shares to buy */
  yesShares: number;
  /** Number of NO shares to buy */
  noShares: number;
  /** Cost to buy YES shares */
  yesCostUsd: number;
  /** Cost to buy NO shares */
  noCostUsd: number;
  /** Total USD investment */
  totalCostUsd: number;
  /** Expected profit when market resolves */
  expectedProfitUsd: number;
  /** Return on investment (profit / cost) */
  roi: number;
}

/**
 * Calculate optimal position size for an arbitrage opportunity.
 *
 * For intra-market arbitrage with EQUAL SHARES strategy:
 * - We buy EQUAL numbers of YES and NO tokens
 * - When market resolves, one side pays $1/share, other is worthless
 * - Since we have equal shares, we always get $1 per share
 * - Cost per share pair = yesPrice + noPrice
 * - Profit per share pair = $1.00 - (yesPrice + noPrice) = spread
 *
 * @param opportunity - The arbitrage opportunity
 * @param portfolioValue - Total portfolio value in USD
 * @param config - Strategy configuration
 * @returns Calculated position size, or null if not viable
 */
export function calculatePositionSize(
  opportunity: ArbitrageOpportunity,
  portfolioValue: number,
  config: StrategyConfig,
): PositionSize | null {
  // Calculate risk-adjusted position size (% of portfolio)
  const maxRiskAmount = portfolioValue * (config.portfolioRiskPct / 100);

  // Cap at max position size
  const positionBudget = Math.min(maxRiskAmount, config.maxPositionSizeUsd);

  // Need minimum viable position
  if (positionBudget < 1) {
    logInfo('Position budget too small', { positionBudget, portfolioValue });
    return null;
  }

  // Cost per share pair (one YES + one NO)
  const costPerPair = opportunity.yesPrice + opportunity.noPrice;

  // This should be < $1.00 for an arbitrage opportunity
  if (costPerPair >= 1.0) {
    logInfo('No arbitrage opportunity - prices sum to >= $1.00', { costPerPair });
    return null;
  }

  // How many share pairs can we buy with our budget?
  const maxPairs = Math.floor(positionBudget / costPerPair);

  // Need at least 1 pair
  if (maxPairs < 1) {
    logInfo('Cannot buy at least 1 share pair', { positionBudget, costPerPair });
    return null;
  }

  // With equal shares strategy, we buy the same number of YES and NO
  const shares = maxPairs;
  const yesCostUsd = shares * opportunity.yesPrice;
  const noCostUsd = shares * opportunity.noPrice;
  const totalCostUsd = yesCostUsd + noCostUsd;

  // Expected profit = shares * $1.00 - totalCost
  // = shares * (1.0 - costPerPair)
  // = shares * spread
  const expectedProfitUsd = shares * opportunity.spread;
  const roi = expectedProfitUsd / totalCostUsd;

  logInfo('Position calculated', {
    shares,
    costPerPair: costPerPair.toFixed(4),
    totalCost: totalCostUsd.toFixed(2),
    expectedProfit: expectedProfitUsd.toFixed(4),
    roi: (roi * 100).toFixed(2) + '%',
  });

  return {
    yesShares: shares,
    noShares: shares,
    yesCostUsd,
    noCostUsd,
    totalCostUsd,
    expectedProfitUsd,
    roi,
  };
}

/**
 * Validate if a calculated position meets minimum requirements.
 *
 * @param position - The calculated position size
 * @param minProfitUsd - Minimum expected profit to execute (default: $0.01)
 * @param minRoi - Minimum ROI to execute (default: 1% = 0.01)
 * @returns True if position should be executed
 */
export function isPositionViable(
  position: PositionSize,
  minProfitUsd: number = 0.01,
  minRoi: number = 0.01,
): boolean {
  // Must have at least 1 share of each
  if (position.yesShares < 1 || position.noShares < 1) {
    return false;
  }

  // Must meet minimum profit threshold
  if (position.expectedProfitUsd < minProfitUsd) {
    return false;
  }

  // Must meet minimum ROI
  if (position.roi < minRoi) {
    return false;
  }

  return true;
}

/**
 * Calculate the optimal number of shares to maximize profit.
 *
 * For intra-market arbitrage, we want to balance:
 * - YES shares × yesPrice + NO shares × noPrice = budget
 * - Maximize min(YES shares, NO shares) for guaranteed profit
 *
 * This is achieved when: YES shares × yesPrice = NO shares × noPrice
 * i.e., equal dollar amounts on each side.
 *
 * @param budget - Total USD budget
 * @param yesPrice - Current YES token price
 * @param noPrice - Current NO token price
 * @returns Optimal shares { yes, no } or null if not viable
 */
export function optimizeShares(
  budget: number,
  yesPrice: number,
  noPrice: number,
): { yes: number; no: number } | null {
  if (budget <= 0 || yesPrice <= 0 || noPrice <= 0) {
    return null;
  }

  // Equal dollar split
  const halfBudget = budget / 2;

  const yesShares = Math.floor(halfBudget / yesPrice);
  const noShares = Math.floor(halfBudget / noPrice);

  if (yesShares < 1 || noShares < 1) {
    return null;
  }

  return { yes: yesShares, no: noShares };
}

/**
 * Estimate slippage for a given order size.
 *
 * Larger orders relative to market liquidity will have more slippage.
 *
 * @param orderSizeUsd - Order size in USD
 * @param marketLiquidity - Market liquidity in USD
 * @returns Estimated slippage as decimal (e.g., 0.01 for 1%)
 */
export function estimateSlippage(orderSizeUsd: number, marketLiquidity: number): number {
  if (marketLiquidity <= 0) {
    return 0.1; // 10% default for unknown liquidity
  }

  // Simple model: slippage = (order_size / liquidity) * factor
  const liquidityRatio = orderSizeUsd / marketLiquidity;
  const slippage = liquidityRatio * 0.5; // 50% of ratio as slippage estimate

  // Cap slippage at 10%
  return Math.min(slippage, 0.1);
}
