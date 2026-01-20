/**
 * Bootstrap Node
 *
 * Initializes the Polymarket agent workflow.
 * Sets up initial state and prepares for trading.
 */

import { ethers } from 'ethers';
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
    // IMPORTANT: Set this higher than your current exposure to allow opportunities
    // Default 500 is very low - set to your desired max exposure limit
    maxTotalExposureUsd: parseFloat(process.env['POLY_MAX_TOTAL_EXPOSURE_USD'] ?? '500'),
    minShareSize: parseFloat(process.env['POLY_MIN_SHARE_SIZE'] ?? '5'),
  };

  // Get wallet address from environment or derive from private key
  let walletAddress = process.env['POLY_FUNDER_ADDRESS'];

  if (!walletAddress) {
    const privateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
    if (privateKey) {
      try {
        const wallet = new ethers.Wallet(privateKey);
        walletAddress = wallet.address;
        logInfo('Wallet address derived from private key', {
          address: walletAddress.substring(0, 10) + '...',
        });
      } catch (error) {
        logInfo('Failed to derive wallet address from private key', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Build task status
  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    'Polymarket agent initialized and ready to scan for arbitrage opportunities.',
  );

  logInfo('Bootstrap complete', {
    minSpread: config.minSpreadThreshold,
    maxPosition: config.maxPositionSizeUsd,
    maxTotalExposure: config.maxTotalExposureUsd,
    pollInterval: config.pollIntervalMs,
    minShareSize: config.minShareSize,
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
