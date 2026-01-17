/**
 * PnL Calculation Utilities
 *
 * Calculates profit and loss for Polymarket positions.
 * Handles both unrealized PnL (open positions) and realized PnL (closed/redeemed).
 */

import type { Position, Transaction } from '../workflow/context.js';
import { logInfo } from '../workflow/context.js';

/**
 * PnL calculation result for a single position.
 */
export interface PositionPnL {
  marketId: string;
  marketTitle: string;
  costBasis: number; // What we paid for the position
  currentValue: number; // Current market value
  unrealizedPnl: number; // Current profit/loss
  unrealizedPnlPct: number; // Percentage return
  shares: number; // Number of shares held
}

/**
 * Portfolio-wide PnL summary.
 */
export interface PortfolioPnL {
  totalCostBasis: number; // Total amount invested
  totalCurrentValue: number; // Total current value of all positions
  totalUnrealizedPnl: number; // Total unrealized profit/loss
  totalRealizedPnl: number; // Total realized profit/loss from closed positions
  totalPnl: number; // Total PnL (realized + unrealized)
  roi: number; // Overall return on investment percentage
  positions: PositionPnL[]; // PnL for each position
}

/**
 * Calculate unrealized PnL for a single position.
 *
 * For prediction markets:
 * - Cost basis = amount paid to enter position
 * - Current value = shares × current market price
 * - Unrealized PnL = current value - cost basis
 *
 * @param position - The position to calculate PnL for
 * @param currentPrice - Current market price for the outcome
 * @returns PnL calculation result
 */
export function calculatePositionPnL(position: Position, currentPrice: number): PositionPnL {
  const costBasis = position.costBasis;
  const currentValue = position.shares * currentPrice;
  const unrealizedPnl = currentValue - costBasis;
  const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

  return {
    marketId: position.marketId,
    marketTitle: position.marketTitle,
    costBasis,
    currentValue,
    unrealizedPnl,
    unrealizedPnlPct,
    shares: position.shares,
  };
}

/**
 * Calculate realized PnL from transaction history.
 *
 * Realized PnL occurs when:
 * 1. A position is sold (sell transaction)
 * 2. A winning position is redeemed for $1/share
 *
 * @param transactions - All transactions in history
 * @returns Total realized PnL
 */
export function calculateRealizedPnL(transactions: Transaction[]): number {
  let realizedPnl = 0;

  // Group transactions by market to track cost basis
  const marketCostBasis = new Map<string, number>();
  const marketShares = new Map<string, number>();

  for (const tx of transactions) {
    const key = `${tx.marketId}-${tx.action}`;

    if (tx.action === 'buy-yes' || tx.action === 'buy-no') {
      // Track cost basis for buy transactions
      const currentCost = marketCostBasis.get(key) || 0;
      const currentShares = marketShares.get(key) || 0;

      marketCostBasis.set(key, currentCost + tx.totalCost);
      marketShares.set(key, currentShares + tx.shares);
    } else if (tx.action === 'sell-yes' || tx.action === 'sell-no') {
      // Calculate realized PnL from sell
      const costBasis = marketCostBasis.get(key) || 0;
      const shares = marketShares.get(key) || 0;

      if (shares > 0) {
        // Calculate average cost per share
        const avgCost = costBasis / shares;

        // Revenue from sale
        const revenue = tx.shares * tx.price;

        // Cost of shares sold
        const cost = tx.shares * avgCost;

        // Realized PnL
        realizedPnl += revenue - cost;

        // Update remaining position
        const remainingShares = shares - tx.shares;
        const remainingCost = remainingShares * avgCost;

        if (remainingShares > 0) {
          marketShares.set(key, remainingShares);
          marketCostBasis.set(key, remainingCost);
        } else {
          // Position fully closed
          marketShares.delete(key);
          marketCostBasis.delete(key);
        }
      }
    } else if (tx.action === 'redeem') {
      // Redemption: winning positions pay $1 per share
      const costBasis = marketCostBasis.get(key) || 0;
      const shares = marketShares.get(key) || 0;

      if (shares > 0) {
        const avgCost = costBasis / shares;
        const redemptionValue = tx.shares * 1.0; // $1 per share
        const cost = tx.shares * avgCost;

        realizedPnl += redemptionValue - cost;

        // Clear position after redemption
        marketShares.delete(key);
        marketCostBasis.delete(key);
      }
    }
  }

  return realizedPnl;
}

/**
 * Calculate portfolio-wide PnL including all positions and transactions.
 *
 * @param positions - Current open positions
 * @param transactions - All historical transactions
 * @param currentPrices - Map of tokenId -> current price
 * @returns Complete portfolio PnL summary
 */
export function calculatePortfolioPnL(
  positions: Position[],
  transactions: Transaction[],
  currentPrices: Map<string, number>,
): PortfolioPnL {
  // Calculate realized PnL from closed positions
  const totalRealizedPnl = calculateRealizedPnL(transactions);

  // Calculate unrealized PnL from open positions
  const positionPnLs: PositionPnL[] = [];
  let totalCostBasis = 0;
  let totalCurrentValue = 0;
  let totalUnrealizedPnl = 0;

  for (const position of positions) {
    const currentPrice = currentPrices.get(position.tokenId) || 0;
    const pnl = calculatePositionPnL(position, currentPrice);

    positionPnLs.push(pnl);
    totalCostBasis += pnl.costBasis;
    totalCurrentValue += pnl.currentValue;
    totalUnrealizedPnl += pnl.unrealizedPnl;
  }

  const totalPnl = totalRealizedPnl + totalUnrealizedPnl;
  const roi = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;

  logInfo('Portfolio PnL calculated', {
    realizedPnl: totalRealizedPnl.toFixed(2),
    unrealizedPnl: totalUnrealizedPnl.toFixed(2),
    totalPnl: totalPnl.toFixed(2),
    roi: roi.toFixed(2) + '%',
    positionCount: positions.length,
  });

  return {
    totalCostBasis,
    totalCurrentValue,
    totalUnrealizedPnl,
    totalRealizedPnl,
    totalPnl,
    roi,
    positions: positionPnLs,
  };
}

/**
 * Update positions with current market prices and PnL.
 *
 * @param positions - Positions to update
 * @param currentPrices - Map of tokenId -> current price
 * @returns Updated positions with current values and PnL
 */
export function updatePositionsWithPnL(
  positions: Position[],
  currentPrices: Map<string, number>,
): Position[] {
  return positions.map((position) => {
    const currentPrice = currentPrices.get(position.tokenId) || 0;
    const currentValue = position.shares * currentPrice;
    const unrealizedPnl = currentValue - position.costBasis;

    return {
      ...position,
      currentValue,
      unrealizedPnl,
    };
  });
}
