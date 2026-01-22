/**
 * Polymarket Strategy - Position Evaluator
 *
 * Evaluates both intra-market and cross-market arbitrage opportunities
 * and calculates optimal position sizes.
 */

import type {
  ArbitrageOpportunity,
  CrossMarketOpportunity,
  StrategyConfig,
} from '../workflow/context.js';
import { logInfo } from '../workflow/context.js';
import type { ApprovalStatus } from '../clients/approvals.js';

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
 * @param approvalStatus - Approval status containing USDC balance and allowance
 * @param config - Strategy configuration
 * @returns Calculated position size, or null if not viable
 */
export function calculatePositionSize(
  opportunity: ArbitrageOpportunity,
  approvalStatus: ApprovalStatus | undefined,
  config: StrategyConfig,
): PositionSize | null {
  // Calculate available capital based on what contract can actually spend
  const usdcBalance = approvalStatus?.usdcBalance ?? 0;
  const usdcAllowance = approvalStatus?.usdcAllowance ?? 0;

  // Position budget is the minimum of:
  // 1. User's configured max position size
  // 2. Available USDC in wallet
  // 3. Approved USDC allowance (most restrictive in DeFi)
  const positionBudget = Math.min(
    config.maxPositionSizeUsd,
    usdcBalance,
    usdcAllowance,
  );

  // Need minimum viable position
  if (positionBudget < 1) {
    logInfo('Position budget too small', {
      positionBudget,
      usdcBalance,
      usdcAllowance,
      maxPositionSize: config.maxPositionSizeUsd,
    });
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

  // Use opportunity's minOrderSize (fetched from API) or fall back to config
  const minShares = opportunity.minOrderSize ?? config.minShareSize ?? 5;

  // Need at least minShares pairs to meet Polymarket minimum
  if (maxPairs < minShares) {
    logInfo('Cannot meet minimum share size requirement', {
      positionBudget,
      costPerPair,
      maxPairs,
      minShares,
      source: opportunity.minOrderSize ? 'API' : 'config',
    });
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

// ============================================================================
// Cross-Market Arbitrage Position Sizing
// ============================================================================

/**
 * Calculated position size for cross-market arbitrage.
 *
 * Unlike intra-market where we buy both YES and NO on same market,
 * cross-market involves buying TWO positions in different markets.
 *
 * Note: We BUY the opposite outcome on the overpriced market (not sell),
 * because Polymarket doesn't support naked shorting.
 */
export interface CrossMarketPositionSize {
  /** Number of shares to trade (same for both sides) */
  shares: number;
  /** Cost of buying opposite outcome on overpriced market (was "sellRevenue") */
  sellRevenueUsd: number;
  /** Cost of buying the underpriced market */
  buyCostUsd: number;
  /** Net cost (sum of both buy orders) */
  netCostUsd: number;
  /** Expected profit when markets resolve */
  expectedProfitUsd: number;
  /** Return on capital (profit / netCost) */
  roi: number;
  /** Estimated slippage on sell side */
  sellSlippage: number;
  /** Estimated slippage on buy side */
  buySlippage: number;
}

/**
 * Calculate position size for cross-market arbitrage opportunity.
 *
 * For IMPLIES relationship (A → B) with price violation:
 * - Market A (parent) is overpriced at P(A) > P(B)
 * - Market B (child) is underpriced
 *
 * Strategy (CORRECTED - both are BUY operations):
 * - BUY Market A NO at price (1 - P(A)) → pay (1 - P(A)) × shares
 * - BUY Market B YES at price P(B) → pay P(B) × shares
 * - Net upfront cost: [1 - P(A)] + P(B) per share
 *
 * Outcomes (assuming A = YES on parent, B = YES on child):
 * - If A YES happens: NO loses (-$), YES wins (+$1) = depends on prices
 * - If A NO happens, B YES happens: NO wins (+$1), YES wins (+$1) = +$2
 * - If both NO: NO wins (+$1), YES loses (-$) = depends on prices
 *
 * The arbitrage profit comes from the price violation.
 *
 * @param opportunity - The cross-market opportunity
 * @param approvalStatus - Approval status containing USDC balance and allowance
 * @param config - Strategy configuration
 * @returns Calculated position size, or null if not viable
 */
export function calculateCrossMarketPositionSize(
  opportunity: CrossMarketOpportunity,
  approvalStatus: ApprovalStatus | undefined,
  config: StrategyConfig,
): CrossMarketPositionSize | null {
  const { trades, relationship } = opportunity;

  // For cross-market, we need capital for BOTH buy orders
  // We buy the opposite outcome on overpriced market + buy underpriced market
  const buyPrice = trades.buyMarket.price;
  const sellPrice = trades.sellMarket.price;
  const oppositePrice = 1.0 - sellPrice; // Complement price for opposite outcome

  // Total cost per share = opposite outcome price + buy market price
  const costPerShare = oppositePrice + buyPrice;

  // Get minimum shares required
  const minShares = opportunity.minOrderSize ?? config.minShareSize ?? 5;
  const minBudgetRequired = minShares * costPerShare;

  // Calculate available capital based on what contract can actually spend
  const usdcBalance = approvalStatus?.usdcBalance ?? 0;
  const usdcAllowance = approvalStatus?.usdcAllowance ?? 0;

  // Position budget is the minimum of:
  // 1. User's configured max position size
  // 2. Available USDC in wallet
  // 3. Approved USDC allowance (most restrictive in DeFi)
  const positionBudget = Math.min(
    config.maxPositionSizeUsd,
    usdcBalance,
    usdcAllowance,
  );

  if (positionBudget < minBudgetRequired) {
    logInfo('Cross-market position budget too small for minimum shares', {
      positionBudget: positionBudget.toFixed(2),
      usdcBalance: usdcBalance.toFixed(2),
      usdcAllowance: usdcAllowance.toFixed(2),
      minBudgetRequired: minBudgetRequired.toFixed(2),
      minShares,
    });
    return null;
  }

  // Maximum shares we can afford
  const maxSharesFromBudget = Math.floor(positionBudget / costPerShare);

  // Also limit by market liquidity (don't trade more than 5% of liquidity)
  const parentLiquidity = relationship.parentMarket.liquidity;
  const childLiquidity = relationship.childMarket.liquidity;
  const minLiquidity = Math.min(parentLiquidity, childLiquidity);
  const maxSharesFromLiquidity = Math.floor((minLiquidity * 0.05) / costPerShare);

  // Take the smaller limit
  const shares = Math.min(maxSharesFromBudget, maxSharesFromLiquidity);

  // Check liquidity constraint (minShares already defined above)
  if (shares < minShares) {
    logInfo('Cannot execute cross-market trade - liquidity constraint', {
      maxSharesFromBudget,
      maxSharesFromLiquidity,
      costPerShare,
      shares,
      minShares,
    });
    return null;
  }

  // Calculate costs (both are BUY operations now)
  const sellRevenueUsd = shares * oppositePrice; // Cost of buying opposite outcome
  const buyCostUsd = shares * buyPrice; // Cost of buying underpriced market
  const netCostUsd = sellRevenueUsd + buyCostUsd; // Total capital required

  // Expected profit = price spread × shares
  const expectedProfitUsd = shares * opportunity.expectedProfitPerShare;

  // ROI based on total capital invested
  const roi = netCostUsd > 0 ? expectedProfitUsd / netCostUsd : 0;

  // Estimate slippage
  const sellOrderSize = sellRevenueUsd;
  const buyOrderSize = buyCostUsd;
  const sellSlippage = estimateSlippage(sellOrderSize, parentLiquidity);
  const buySlippage = estimateSlippage(buyOrderSize, childLiquidity);

  logInfo('Cross-market position calculated', {
    shares,
    sellPrice: sellPrice.toFixed(4),
    buyPrice: buyPrice.toFixed(4),
    sellRevenue: sellRevenueUsd.toFixed(2),
    buyCost: buyCostUsd.toFixed(2),
    netCost: netCostUsd.toFixed(2),
    expectedProfit: expectedProfitUsd.toFixed(4),
    roi: roi === Infinity ? 'Infinite' : (roi * 100).toFixed(2) + '%',
    sellSlippage: (sellSlippage * 100).toFixed(2) + '%',
    buySlippage: (buySlippage * 100).toFixed(2) + '%',
  });

  return {
    shares,
    sellRevenueUsd,
    buyCostUsd,
    netCostUsd,
    expectedProfitUsd,
    roi,
    sellSlippage,
    buySlippage,
  };
}

/**
 * Validate if a cross-market position meets minimum requirements.
 *
 * @param position - The calculated position size
 * @param minProfitUsd - Minimum expected profit to execute (default: $0.01)
 * @param maxSlippage - Maximum acceptable slippage (default: 5%)
 * @returns True if position should be executed
 */
export function isCrossMarketPositionViable(
  position: CrossMarketPositionSize,
  minProfitUsd: number = 0.01,
  maxSlippage: number = 0.05,
): boolean {
  // Must have at least 1 share
  if (position.shares < 1) {
    return false;
  }

  // Must meet minimum profit threshold (higher than intra-market due to complexity)
  if (position.expectedProfitUsd < minProfitUsd) {
    logInfo('Cross-market position profit too low', {
      expectedProfit: position.expectedProfitUsd.toFixed(3),
      minRequired: minProfitUsd.toFixed(3),
    });
    return false;
  }

  // Check slippage tolerance
  if (position.sellSlippage > maxSlippage || position.buySlippage > maxSlippage) {
    logInfo('Cross-market position slippage too high', {
      sellSlippage: (position.sellSlippage * 100).toFixed(2) + '%',
      buySlippage: (position.buySlippage * 100).toFixed(2) + '%',
      maxAllowed: (maxSlippage * 100).toFixed(2) + '%',
    });
    return false;
  }

  return true;
}
