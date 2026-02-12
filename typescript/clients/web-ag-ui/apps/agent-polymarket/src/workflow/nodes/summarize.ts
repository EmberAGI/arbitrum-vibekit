/**
 * Summarize Node
 *
 * Creates a summary of the current cycle for reporting.
 */

import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';

// Type for CopilotKit config parameter (contains threadId)
type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

/**
 * Create a summary of the current workflow state.
 */
export async function summarizeNode(
  state: PolymarketState,
  config: CopilotKitConfig,
): Promise<PolymarketUpdate> {
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

  // Emit state update to frontend for real-time UI updates
  // Preserve array fields from being cleared by partial state update
  await copilotkitEmitState(config, {
    view: {
      task,
      detectedRelationships: state.view.detectedRelationships,
      crossMarketOpportunities: state.view.crossMarketOpportunities,
      opportunities: state.view.opportunities,
      markets: state.view.markets,
      events: [statusEvent],
    },
  });

  return {
    view: {
      task,
      events: [statusEvent],
      // Preserve all arrays from state to prevent partial merge from clearing them
      detectedRelationships: state.view.detectedRelationships,
      crossMarketOpportunities: state.view.crossMarketOpportunities,
      opportunities: state.view.opportunities,
      markets: state.view.markets,
    },
  };
}
