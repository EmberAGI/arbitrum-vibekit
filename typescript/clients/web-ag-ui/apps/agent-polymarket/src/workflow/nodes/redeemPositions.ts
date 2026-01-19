/**
 * Redeem Positions Workflow Node
 *
 * Checks for resolved markets and redeems winning positions.
 * Winning positions can be redeemed for $1 per share in USDC.
 *
 * Steps:
 * 1. Check all positions for resolved markets
 * 2. Identify winning positions
 * 3. Redeem positions (when implemented)
 * 4. Update transaction history with redemptions
 */

import type { PolymarketState, PolymarketUpdate, Position, Transaction } from '../context.js';
import { logInfo } from '../context.js';
import { createAdapterFromEnv } from '../../clients/polymarketClient.js';
import { v7 as uuidv7 } from 'uuid';

/**
 * Redeemable position awaiting redemption.
 */
export interface RedeemablePosition {
  position: Position;
  winningOutcome?: 'yes' | 'no';
  redemptionValue: number; // shares * $1
  resolutionDate?: string;
}

/**
 * Check for resolved markets and redeem winning positions.
 * Non-interrupting - processes redemptions automatically.
 */
export async function redeemPositionsNode(
  state: PolymarketState,
): Promise<PolymarketUpdate> {
  const positions = state.view.positions;

  if (positions.length === 0) {
    logInfo('No positions to check for redemption');
    return { view: {} };
  }

  logInfo('Checking positions for redemption', { count: positions.length });

  try {
    const adapter = await createAdapterFromEnv();

    if (!adapter) {
      logInfo('⚠️ No adapter available - skipping redemption');
      return { view: {} };
    }

    const redeemablePositions: RedeemablePosition[] = [];
    const newTransactions: Transaction[] = [];
    let totalRedemptionValue = 0;

    // Check each position for market resolution
    for (const position of positions) {
      try {
        // Use tokenId for reliable API lookup (marketId is conditionId which doesn't work well with Gamma API)
        const resolution = await adapter.getMarketResolution(position.tokenId);

        if (!resolution.resolved) {
          // Market not resolved yet
          continue;
        }

        // Check if our position is on the winning side
        const isWinningPosition = position.side === resolution.winningOutcome;

        if (!isWinningPosition) {
          logInfo('Position lost - market resolved against us', {
            market: position.marketTitle.substring(0, 40),
            ourSide: position.side,
            winningSide: resolution.winningOutcome,
          });
          continue;
        }

        // We have a winning position!
        const redemptionValue = position.shares * 1.0; // $1 per share

        logInfo('✅ Found winning position', {
          market: position.marketTitle.substring(0, 40),
          side: position.side,
          shares: position.shares,
          redemptionValue: redemptionValue.toFixed(2),
        });

        redeemablePositions.push({
          position,
          winningOutcome: resolution.winningOutcome,
          redemptionValue,
          resolutionDate: resolution.resolutionDate,
        });

        totalRedemptionValue += redemptionValue;

        // Attempt to redeem via contract call (use tokenId for reliable lookup)
        const result = await adapter.redeemPosition(position.tokenId, position.side);

        if (result.success) {
          // Redemption successful - create transaction record
          const redemptionTx: Transaction = {
            id: uuidv7(),
            cycle: state.view.metrics.iteration,
            action: 'redeem',
            marketId: position.marketId,
            marketTitle: position.marketTitle,
            shares: position.shares,
            price: 1.0, // Redeemed at $1 per share
            totalCost: redemptionValue,
            status: 'success',
            timestamp: new Date().toISOString(),
            orderId: result.txHash,
          };

          newTransactions.push(redemptionTx);

          logInfo('✅ Position redeemed', {
            market: position.marketTitle.substring(0, 40),
            value: redemptionValue.toFixed(2),
            txHash: result.txHash,
          });
        } else {
          logInfo('⚠️ Redemption not yet implemented', {
            market: position.marketTitle.substring(0, 40),
            error: result.error,
          });

          // Create pending redemption transaction
          const pendingRedemptionTx: Transaction = {
            id: uuidv7(),
            cycle: state.view.metrics.iteration,
            action: 'redeem',
            marketId: position.marketId,
            marketTitle: position.marketTitle,
            shares: position.shares,
            price: 1.0,
            totalCost: redemptionValue,
            status: 'pending',
            timestamp: new Date().toISOString(),
            error: result.error,
          };

          newTransactions.push(pendingRedemptionTx);
        }
      } catch (error) {
        logInfo('Error checking position for redemption', {
          marketId: position.marketId,
          error: String(error),
        });
      }
    }

    if (redeemablePositions.length === 0) {
      logInfo('No winning positions found for redemption');
      return { view: {} };
    }

    logInfo('Redemption check complete', {
      redeemableCount: redeemablePositions.length,
      totalValue: totalRedemptionValue.toFixed(2),
      transactionsCreated: newTransactions.length,
    });

    // Remove redeemed positions from active positions
    const remainingPositions = positions.filter(
      (pos) =>
        !redeemablePositions.some((redeemable) => redeemable.position.tokenId === pos.tokenId),
    );

    return {
      view: {
        positions: remainingPositions,
        transactionHistory: [...state.view.transactionHistory, ...newTransactions],
        metrics: {
          ...state.view.metrics,
          activePositions: remainingPositions.length,
        },
      },
    };
  } catch (error) {
    logInfo('Error during redemption check', { error: String(error) });
    return { view: {} };
  }
}
