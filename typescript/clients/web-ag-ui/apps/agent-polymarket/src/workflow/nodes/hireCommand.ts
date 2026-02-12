/**
 * Hire Command Node
 *
 * Handles the 'hire' command to activate the agent.
 */

import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';

// Type for CopilotKit config parameter (contains threadId)
type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

/**
 * Process the hire command.
 *
 * This transitions the agent from 'disabled' to 'waiting-funds' or 'running'.
 */
export async function hireCommandNode(
  state: PolymarketState,
  config: CopilotKitConfig,
): Promise<PolymarketUpdate> {
  logInfo('Processing hire command');

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    'Agent hired! Initializing Polymarket arbitrage scanning...',
  );

  // Emit state update to frontend for real-time UI updates
  await copilotkitEmitState(config, {
    view: {
      task,
      lifecycleState: 'waiting-funds',
      onboarding: {
        step: 1,
        totalSteps: 2,
        key: 'hire',
      },
      markets: [],
      opportunities: [],
      crossMarketOpportunities: [],
      detectedRelationships: [],
      positions: [],
      userPositions: [],
      tradingHistory: [],
      transactionHistory: [],
      pendingTrades: [],
      portfolioValueUsd: 0,
      metrics: {
        iteration: 0,
        totalPnl: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        activePositions: 0,
        opportunitiesFound: 0,
        opportunitiesExecuted: 0,
        tradesExecuted: 0,
        tradesFailed: 0,
      },
      events: [statusEvent],
    },
  });

  return {
    view: {
      task,
      lifecycleState: 'waiting-funds',
      onboarding: {
        step: 1,
        totalSteps: 2,
        key: 'hire',
      },
      // Clear all per-cycle data from previous session
      markets: [],
      opportunities: [],
      crossMarketOpportunities: [],
      detectedRelationships: [],
      positions: [],
      userPositions: [],
      tradingHistory: [],
      transactionHistory: [],
      pendingTrades: [],
      portfolioValueUsd: 0,
      // Reset all metrics to start fresh
      metrics: {
        iteration: 0,
        totalPnl: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        activePositions: 0,
        opportunitiesFound: 0,
        opportunitiesExecuted: 0,
        tradesExecuted: 0,
        tradesFailed: 0,
      },
      events: [statusEvent],
    },
  };
}
