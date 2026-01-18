/**
 * Polymarket Strategy - Market Scanner
 *
 * Scans Polymarket markets for both:
 * 1. Intra-market arbitrage: YES + NO < $1.00 on same market
 * 2. Cross-market arbitrage: Logical relationship violations between different markets
 */

import type {
  Market,
  ArbitrageOpportunity,
  CrossMarketOpportunity,
  MarketRelationship,
  StrategyConfig,
} from '../workflow/context.js';
import { logInfo } from '../workflow/context.js';
import {
  detectMarketRelationships,
  checkPriceViolation,
} from './relationshipDetector.js';

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
      // Use market's minOrderSize if available, otherwise use config default
      const minOrderSize = market.minOrderSize ?? config.minShareSize ?? 5;

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
        minOrderSize,
      });

      logInfo('Arbitrage opportunity found', {
        market: market.title.substring(0, 50),
        yesPrice: market.yesPrice.toFixed(3),
        noPrice: market.noPrice.toFixed(3),
        spread: (spread * 100).toFixed(2) + '%',
        minOrderSize,
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

// ============================================================================
// Cross-Market Arbitrage Scanner
// ============================================================================

/**
 * Scan markets for cross-market arbitrage opportunities based on logical relationships.
 *
 * Process:
 * 1. Detect logical relationships between markets (IMPLIES, MUTUAL_EXCLUSION, etc.)
 * 2. Check each relationship for price violations
 * 3. Return opportunities sorted by expected profit
 *
 * @param markets - Array of active markets to analyze
 * @param config - Strategy configuration
 * @param useLLM - Whether to use LLM for relationship detection (default: false)
 * @returns Tuple of [opportunities, relationships] for tracking
 */
export async function scanForCrossMarketOpportunities(
  markets: Market[],
  config: StrategyConfig,
  useLLM = false,
): Promise<{
  opportunities: CrossMarketOpportunity[];
  relationships: MarketRelationship[];
}> {
  console.log('\n' + '*'.repeat(80));
  console.log('🔎 [CROSS-MARKET SCANNER] Starting scan for arbitrage opportunities');
  console.log('*'.repeat(80));
  console.log('Markets to analyze:', markets.length);
  console.log('Use LLM detection:', useLLM);
  console.log('Min spread threshold:', config.minSpreadThreshold);
  console.log('*'.repeat(80) + '\n');

  logInfo('Starting cross-market opportunity scan', {
    marketCount: markets.length,
    useLLM,
  });

  // Step 1: Detect relationships between markets
  const relationships = await detectMarketRelationships(markets, useLLM);

  logInfo(`Detected ${relationships.length} market relationships`, {
    byType: countRelationshipTypes(relationships),
  });

  // Step 2: Check each relationship for price violations
  const opportunities: CrossMarketOpportunity[] = [];

  for (const relationship of relationships) {
    const opportunity = checkPriceViolation(relationship);

    if (opportunity) {
      opportunities.push(opportunity);

      logInfo('Cross-market opportunity found', {
        type: relationship.type,
        parent: relationship.parentMarket.title.substring(0, 40),
        child: relationship.childMarket.title.substring(0, 40),
        violation: opportunity.violation.type,
        expectedProfit: `$${opportunity.expectedProfitPerShare.toFixed(3)}`,
      });
    }
  }

  // Step 3: Sort by expected profit (highest first)
  opportunities.sort((a, b) => b.expectedProfitPerShare - a.expectedProfitPerShare);

  if (opportunities.length > 0) {
    logInfo(`Found ${opportunities.length} cross-market opportunities`, {
      bestProfit: `$${opportunities[0]?.expectedProfitPerShare.toFixed(3)} per share`,
      totalRelationships: relationships.length,
    });
  }

  return { opportunities, relationships };
}

/**
 * Filter cross-market opportunities based on risk and execution constraints.
 *
 * @param opportunities - Raw opportunities from scanner
 * @param config - Strategy configuration
 * @param currentExposure - Current total USD exposure
 * @returns Filtered opportunities ready for execution
 */
export function filterCrossMarketOpportunities(
  opportunities: CrossMarketOpportunity[],
  config: StrategyConfig,
  currentExposure: number,
): CrossMarketOpportunity[] {
  const remainingCapacity = config.maxTotalExposureUsd - currentExposure;

  if (remainingCapacity <= 0) {
    logInfo('Max exposure reached, skipping cross-market opportunities', {
      currentExposure,
      maxExposure: config.maxTotalExposureUsd,
    });
    return [];
  }

  return opportunities.filter((opp) => {
    // Minimum profit threshold: $0.50 per share to cover transaction costs
    const minProfitThreshold = 0.005; // $0.005 = 0.5 cents per share
    if (opp.expectedProfitPerShare < minProfitThreshold) {
      return false;
    }

    // Skip opportunities with very low liquidity markets
    const minLiquidity = 1000; // $1,000 minimum liquidity
    if (
      opp.relationship.parentMarket.liquidity < minLiquidity ||
      opp.relationship.childMarket.liquidity < minLiquidity
    ) {
      return false;
    }

    // Skip if markets resolve at very different times (risk of holding one side too long)
    const parentEndDate = new Date(opp.relationship.parentMarket.endDate);
    const childEndDate = new Date(opp.relationship.childMarket.endDate);
    const daysDiff = Math.abs(parentEndDate.getTime() - childEndDate.getTime()) / (1000 * 60 * 60 * 24);

    // Max 30 days difference in resolution
    if (daysDiff > 30) {
      logInfo('Skipping opportunity due to resolution time mismatch', {
        parent: opp.relationship.parentMarket.title.substring(0, 30),
        child: opp.relationship.childMarket.title.substring(0, 30),
        daysDiff: daysDiff.toFixed(0),
      });
      return false;
    }

    return true;
  });
}

/**
 * Helper: Count relationships by type for logging
 */
function countRelationshipTypes(
  relationships: MarketRelationship[],
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const rel of relationships) {
    counts[rel.type] = (counts[rel.type] || 0) + 1;
  }

  return counts;
}
