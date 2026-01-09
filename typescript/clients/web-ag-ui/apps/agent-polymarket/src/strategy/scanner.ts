/**
 * Polymarket Strategy - Market Scanner
 *
 * Scans Polymarket markets for intra-market arbitrage opportunities.
 * An opportunity exists when YES + NO prices sum to less than $1.00.
 */

import type { Market, ArbitrageOpportunity, StrategyConfig } from '../workflow/context.js';
import { logInfo } from '../workflow/context.js';

/**
 * Scan markets for intra-market arbitrage opportunities.
 *
 * For each market, checks if:
 *   yesPrice + noPrice < 1.0 - minSpreadThreshold
 *
 * If true, buying both YES and NO guarantees profit when the market resolves.
 *
 * @param markets - Array of active markets with prices
 * @param config - Strategy configuration with thresholds
 * @returns Array of opportunities sorted by profit potential (highest first)
 */
export function scanForOpportunities(
  markets: Market[],
  config: StrategyConfig,
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  const now = new Date().toISOString();

  for (const market of markets) {
    // Skip resolved or inactive markets
    if (market.resolved || !market.active) {
      continue;
    }

    // Skip markets with invalid prices
    if (
      market.yesPrice <= 0 ||
      market.noPrice <= 0 ||
      market.yesPrice >= 1 ||
      market.noPrice >= 1
    ) {
      continue;
    }

    const combinedPrice = market.yesPrice + market.noPrice;
    const spread = 1.0 - combinedPrice;

    // Check if spread exceeds threshold
    if (spread >= config.minSpreadThreshold) {
      opportunities.push({
        marketId: market.id,
        marketTitle: market.title,
        yesTokenId: market.yesTokenId,
        noTokenId: market.noTokenId,
        yesPrice: market.yesPrice,
        noPrice: market.noPrice,
        spread,
        profitPotential: spread, // Profit per $1 invested (both sides)
        timestamp: now,
      });

      logInfo('Arbitrage opportunity found', {
        market: market.title.substring(0, 50),
        yesPrice: market.yesPrice.toFixed(3),
        noPrice: market.noPrice.toFixed(3),
        spread: (spread * 100).toFixed(2) + '%',
      });
    }
  }

  // Sort by profit potential (highest first)
  opportunities.sort((a, b) => b.profitPotential - a.profitPotential);

  if (opportunities.length > 0) {
    logInfo(`Found ${opportunities.length} arbitrage opportunities`, {
      bestSpread: (opportunities[0]?.spread ?? 0 * 100).toFixed(2) + '%',
    });
  }

  return opportunities;
}

/**
 * Filter opportunities based on additional criteria.
 *
 * @param opportunities - Raw opportunities from scanner
 * @param config - Strategy configuration
 * @param currentExposure - Current total USD exposure across positions
 * @returns Filtered opportunities that can be executed
 */
export function filterOpportunities(
  opportunities: ArbitrageOpportunity[],
  config: StrategyConfig,
  currentExposure: number,
): ArbitrageOpportunity[] {
  const remainingCapacity = config.maxTotalExposureUsd - currentExposure;

  if (remainingCapacity <= 0) {
    logInfo('Max exposure reached, skipping all opportunities', {
      currentExposure,
      maxExposure: config.maxTotalExposureUsd,
    });
    return [];
  }

  // Filter to opportunities we can afford to execute
  return opportunities.filter((opp) => {
    // Minimum position size check (need at least $10 to make it worthwhile)
    const minPositionSize = Math.min(10, config.maxPositionSizeUsd * 0.1);
    if (remainingCapacity < minPositionSize) {
      return false;
    }

    // Skip very small spreads (might not cover transaction costs)
    if (opp.spread < 0.01) {
      return false;
    }

    return true;
  });
}

/**
 * Estimate the time until a market resolves based on its end date.
 *
 * @param endDate - Market end date (ISO string)
 * @returns Days until resolution, or undefined if already ended
 */
export function daysUntilResolution(endDate: string): number | undefined {
  const end = new Date(endDate);
  const now = new Date();

  if (end <= now) {
    return undefined;
  }

  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate expected annualized return for an opportunity.
 *
 * @param spread - The arbitrage spread (e.g., 0.02 for 2%)
 * @param daysUntil - Days until market resolution
 * @returns Annualized return as decimal (e.g., 0.365 for 36.5%)
 */
export function calculateAnnualizedReturn(spread: number, daysUntil: number): number {
  if (daysUntil <= 0) return 0;

  // Simple annualization: (spread / daysUntil) * 365
  return (spread / daysUntil) * 365;
}
