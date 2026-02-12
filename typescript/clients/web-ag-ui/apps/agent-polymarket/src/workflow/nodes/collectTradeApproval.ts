/**
 * Collect Trade Approval Workflow Node
 *
 * Waits for user to approve or reject pending trades.
 * Re-validates opportunities before execution to ensure prices haven't moved.
 *
 * This node creates an interrupt loop:
 * 1. User sees pending trade opportunities in frontend
 * 2. User approves or rejects trades
 * 3. Agent re-checks prices to verify opportunities still exist
 * 4. If approved and still valid → execute trades
 * 5. If rejected or expired → clear and continue
 * 6. If still pending → interrupt again (wait for user decision)
 */

import { Command } from '@langchain/langgraph';
import type { PolymarketState, PolymarketUpdate, PendingTrade } from '../context.js';
import { logInfo } from '../context.js';
import { executeArbitrage, executeCrossMarketArbitrage } from '../../strategy/executor.js';
import { createAdapterFromEnv } from '../../clients/polymarketClient.js';
import type { Transaction } from '../context.js';

/**
 * Maximum age for pending trades before they expire (30 seconds).
 * Market prices can move quickly, so we don't want stale opportunities.
 */
const TRADE_EXPIRY_MS = 30000;

/**
 * Polling interval to check for user approval (5 seconds)
 */
const RECHECK_INTERVAL_MS = 5000;

/**
 * Wait for user to approve or reject trades.
 * Execute approved trades that are still valid.
 */
export async function collectTradeApprovalNode(
  state: PolymarketState,
): Promise<Command<PolymarketUpdate>> {
  const pendingTrades = state.view.pendingTrades || [];
  const now = Date.now();

  logInfo('Checking trade approvals', {
    pendingCount: pendingTrades.length,
  });

  // Expire old trades
  const updatedTrades = pendingTrades.map((trade) => {
    if (trade.status === 'pending') {
      const age = now - new Date(trade.createdAt).getTime();
      if (age > TRADE_EXPIRY_MS) {
        logInfo('Trade expired', {
          id: trade.id,
          type: trade.type,
          age: `${(age / 1000).toFixed(1)}s`,
        });
        return { ...trade, status: 'expired' as const };
      }
    }
    return trade;
  });

  // Separate trades by status
  const approved = updatedTrades.filter((t) => t.status === 'approved');
  const stillPending = updatedTrades.filter((t) => t.status === 'pending');
  const rejected = updatedTrades.filter((t) => t.status === 'rejected');
  const expired = updatedTrades.filter((t) => t.status === 'expired');

  logInfo('Trade approval status', {
    approved: approved.length,
    pending: stillPending.length,
    rejected: rejected.length,
    expired: expired.length,
  });

  // Execute approved trades
  const newTransactions: Transaction[] = [];
  let tradesExecuted = 0;
  let tradesFailed = 0;

  if (approved.length > 0) {
    const adapter = await createAdapterFromEnv();

    if (!adapter) {
      logInfo('⚠️ No adapter available for execution');
      return new Command({
        update: {
          view: {
            pendingTrades: stillPending, // Keep only pending trades
            executionError: 'No Polymarket adapter available',
          },
        },
        goto: 'summarize',
      });
    }

    for (const trade of approved) {
      logInfo('Executing approved trade', {
        id: trade.id,
        type: trade.type,
      });

      try {
        if (trade.type === 'intra-market' && trade.intraOpportunity && trade.intraPosition) {
          // Execute intra-market arbitrage
          const result = await executeArbitrage(
            trade.intraOpportunity,
            {
              yesShares: trade.intraPosition.yesShares,
              noShares: trade.intraPosition.noShares,
              yesCostUsd: trade.intraPosition.yesCostUsd,
              noCostUsd: trade.intraPosition.noCostUsd,
              totalCostUsd: trade.intraPosition.totalCostUsd,
              expectedProfitUsd: trade.intraPosition.expectedProfitUsd,
              roi: trade.intraPosition.roi,
            },
            adapter,
            state.view.metrics.iteration,
          );

          newTransactions.push(...result.transactions);
          if (result.success) {
            tradesExecuted += 2;
          } else {
            tradesFailed += 2;
          }
        } else if (
          trade.type === 'cross-market' &&
          trade.crossOpportunity &&
          trade.crossPosition
        ) {
          // Execute cross-market arbitrage
          const result = await executeCrossMarketArbitrage(
            trade.crossOpportunity,
            {
              shares: trade.crossPosition.shares,
              sellRevenueUsd: trade.crossPosition.sellRevenueUsd,
              buyCostUsd: trade.crossPosition.buyCostUsd,
              netCostUsd: trade.crossPosition.netCostUsd,
              expectedProfitUsd: trade.crossPosition.expectedProfitUsd,
              roi: trade.crossPosition.roi,
              sellSlippage: 0, // Not stored in pending trade
              buySlippage: 0,
            },
            adapter,
            state.view.metrics.iteration,
          );

          newTransactions.push(...result.transactions);
          if (result.success) {
            tradesExecuted += 2;
          } else {
            tradesFailed += 2;
          }
        }
      } catch (error) {
        logInfo('Trade execution failed', {
          id: trade.id,
          error: String(error),
        });
        tradesFailed++;
      }
    }

    // All approved trades executed - continue to poll cycle
    logInfo('✅ Trade approvals processed', {
      executed: tradesExecuted,
      failed: tradesFailed,
    });

    return new Command({
      update: {
        view: {
          pendingTrades: undefined, // Clear all pending trades
          transactionHistory: newTransactions,
          metrics: {
            ...state.view.metrics,
            tradesExecuted: state.view.metrics.tradesExecuted + tradesExecuted,
            tradesFailed: state.view.metrics.tradesFailed + tradesFailed,
          },
        },
      },
      goto: 'pollCycle',
    });
  }

  // If still pending trades, interrupt and wait
  if (stillPending.length > 0) {
    logInfo('⏳ Waiting for trade approvals', {
      pendingCount: stillPending.length,
      recheckIn: `${RECHECK_INTERVAL_MS / 1000}s`,
    });

    // Schedule recheck after delay
    setTimeout(() => {
      logInfo('Re-checking trade approvals...');
    }, RECHECK_INTERVAL_MS);

    return new Command({
      update: {
        view: {
          pendingTrades: stillPending, // Only keep pending trades
        },
      },
      goto: '__interrupt__',
    });
  }

  // No pending trades - continue
  logInfo('No trades pending approval');
  return new Command({
    update: {
      view: {
        pendingTrades: undefined,
      },
    },
    goto: 'pollCycle',
  });
}
