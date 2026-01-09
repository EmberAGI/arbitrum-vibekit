/**
 * Bootstrap Node
 *
 * Initializes the Polymarket agent workflow.
 * Sets up initial state and prepares for trading.
 */

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus, DEFAULT_STRATEGY_CONFIG } from '../context.js';

/**
 * Bootstrap the Polymarket agent workflow.
 *
 * This node:
 * 1. Loads configuration from environment
 * 2. Initializes metrics
 * 3. Sets lifecycle state to 'running'
 */
export async function bootstrapNode(state: PolymarketState): Promise<PolymarketUpdate> {
  logInfo('Bootstrap node starting');

  // Load configuration from environment with defaults
  const config = {
    ...DEFAULT_STRATEGY_CONFIG,
    minSpreadThreshold: parseFloat(process.env['POLY_MIN_SPREAD_THRESHOLD'] ?? '0.02'),
    maxPositionSizeUsd: parseFloat(process.env['POLY_MAX_POSITION_SIZE_USD'] ?? '100'),
    portfolioRiskPct: parseFloat(process.env['POLY_PORTFOLIO_RISK_PCT'] ?? '3'),
    pollIntervalMs: parseInt(process.env['POLY_POLL_INTERVAL_MS'] ?? '30000', 10),
  };

  // Get wallet address from environment or private key
  const walletAddress = process.env['POLY_FUNDER_ADDRESS'];

  // Build task status
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    'Polymarket agent initialized and ready to scan for arbitrage opportunities.',
  );

  logInfo('Bootstrap complete', {
    minSpread: config.minSpreadThreshold,
    maxPosition: config.maxPositionSizeUsd,
    pollInterval: config.pollIntervalMs,
  });

  return {
    view: {
      task,
      lifecycleState: 'running',
      config,
      events: [statusEvent],
    },
    private: {
      bootstrapped: true,
      pollIntervalMs: config.pollIntervalMs,
      walletAddress,
    },
  };
}
