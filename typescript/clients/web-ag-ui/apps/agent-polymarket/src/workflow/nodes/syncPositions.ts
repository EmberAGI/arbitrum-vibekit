/**
 * Sync Positions Workflow Node
 *
 * Fetches current positions from Polymarket, calculates PnL, and updates state.
 * Should be called periodically to keep position data fresh.
 *
 * Steps:
 * 1. Fetch positions from adapter
 * 2. Fetch current prices for position tokens
 * 3. Calculate realized and unrealized PnL
 * 4. Update state with positions and metrics
 */

import type { PolymarketState, PolymarketUpdate, Position } from '../context.js';
import { logInfo } from '../context.js';
import { createAdapterFromEnv, fetchMarketPrices } from '../../clients/polymarketClient.js';
import {
  calculatePortfolioPnL,
  updatePositionsWithPnL,
} from '../../strategy/pnl.js';

/**
 * Sync positions and calculate PnL.
 * Non-interrupting - just updates state and returns.
 */
export async function syncPositionsNode(
  state: PolymarketState,
): Promise<PolymarketUpdate> {
  const walletAddress = state.private.walletAddress;

  if (!walletAddress) {
    logInfo('⚠️ No wallet address - skipping position sync');
    return { view: {} };
  }

  logInfo('Syncing positions', {
    wallet: walletAddress.substring(0, 10) + '...',
  });

  try {
    const adapter = await createAdapterFromEnv();

    if (!adapter) {
      logInfo('⚠️ No adapter available - skipping position sync');
      return { view: {} };
    }

    // Step 1: Fetch positions
    const { positions: userPositions } = await adapter.getPositions(walletAddress);

    if (userPositions.length === 0) {
      logInfo('No open positions found');
      return {
        view: {
          positions: [],
          metrics: {
            ...state.view.metrics,
            activePositions: 0,
            unrealizedPnl: 0,
          },
        },
      };
    }

    logInfo('Fetched positions', { count: userPositions.length });

    // Step 2: Fetch current prices for all position tokens
    const priceMap = new Map<string, number>();

    for (const pos of userPositions) {
      try {
        // For now, we'll use a simple price fetch
        // In production, we'd batch these requests
        const prices = await fetchMarketPrices(pos.tokenId, pos.tokenId);

        // Use buy price as current market price
        const currentPrice = pos.outcomeId === 'yes' ? prices.yesBuyPrice : prices.noBuyPrice;
        priceMap.set(pos.tokenId, currentPrice);

        logInfo('Price fetched', {
          tokenId: pos.tokenId.substring(0, 16),
          outcome: pos.outcomeId,
          price: currentPrice.toFixed(3),
        });
      } catch (error) {
        logInfo('Failed to fetch price', {
          tokenId: pos.tokenId,
          error: String(error),
        });
        // Default to 0 if price fetch fails
        priceMap.set(pos.tokenId, 0);
      }
    }

    // Step 3: Convert to our Position type and calculate cost basis from transactions
    const positions: Position[] = [];

    for (const pos of userPositions) {
      // Find buy transactions for this market/outcome to calculate cost basis
      const buyTxs = state.view.transactionHistory.filter(
        (tx) =>
          tx.marketId === pos.marketId &&
          ((pos.outcomeId === 'yes' && tx.action === 'buy-yes') ||
            (pos.outcomeId === 'no' && tx.action === 'buy-no')) &&
          tx.status === 'success',
      );

      // Calculate cost basis from buy transactions
      let costBasis = 0;
      let totalShares = 0;

      for (const tx of buyTxs) {
        costBasis += tx.totalCost;
        totalShares += tx.shares;
      }

      // If we have shares but no transactions (positions from before agent started),
      // estimate cost basis using current price
      if (parseFloat(pos.size) > 0 && totalShares === 0) {
        const currentPrice = priceMap.get(pos.tokenId) || 0;
        costBasis = parseFloat(pos.size) * currentPrice;
        totalShares = parseFloat(pos.size);
      }

      const currentPrice = priceMap.get(pos.tokenId) || 0;
      const shares = parseFloat(pos.size);
      const currentValue = shares * currentPrice;
      const unrealizedPnl = currentValue - costBasis;

      positions.push({
        marketId: pos.marketId,
        marketTitle: pos.marketTitle,
        tokenId: pos.tokenId,
        side: pos.outcomeId,
        shares,
        costBasis,
        currentValue,
        unrealizedPnl,
      });
    }

    // Step 4: Calculate portfolio PnL
    const portfolioPnL = calculatePortfolioPnL(
      positions,
      state.view.transactionHistory,
      priceMap,
    );

    logInfo('✅ Positions synced', {
      positionCount: positions.length,
      totalValue: portfolioPnL.totalCurrentValue.toFixed(2),
      totalPnl: portfolioPnL.totalPnl.toFixed(2),
      roi: portfolioPnL.roi.toFixed(2) + '%',
    });

    // Update state
    return {
      view: {
        positions,
        portfolioValueUsd: portfolioPnL.totalCurrentValue,
        metrics: {
          ...state.view.metrics,
          activePositions: positions.length,
          unrealizedPnl: portfolioPnL.totalUnrealizedPnl,
          realizedPnl: portfolioPnL.totalRealizedPnl,
          totalPnl: portfolioPnL.totalPnl,
        },
      },
    };
  } catch (error) {
    logInfo('Error syncing positions', { error: String(error) });
    return { view: {} };
  }
}
