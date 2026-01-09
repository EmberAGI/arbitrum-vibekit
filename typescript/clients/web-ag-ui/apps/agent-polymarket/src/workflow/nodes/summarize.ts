/**
 * Summarize Node
 *
 * Creates a summary of the current cycle for reporting.
 */

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';

/**
 * Create a summary of the current workflow state.
 */
export function summarizeNode(state: PolymarketState): PolymarketUpdate {
  const metrics = state.view.metrics;

  const summary = [
    `Polymarket Arbitrage Agent - Cycle ${metrics.iteration}`,
    `Status: ${state.view.lifecycleState}`,
    `Markets scanned: ${state.view.markets.length}`,
    `Opportunities found: ${metrics.opportunitiesFound}`,
    `Trades executed: ${metrics.tradesExecuted}`,
    `Active positions: ${metrics.activePositions}`,
    `Total PnL: $${metrics.totalPnl.toFixed(2)}`,
  ].join('\n');

  logInfo('Cycle summary', {
    iteration: metrics.iteration,
    opportunities: metrics.opportunitiesFound,
    trades: metrics.tradesExecuted,
    pnl: metrics.totalPnl,
  });

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'completed',
    summary,
  );

  return {
    view: {
      task,
      events: [statusEvent],
    },
  };
}
