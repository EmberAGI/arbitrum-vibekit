/**
 * Bootstrap Node
 *
 * Initializes the Polymarket agent workflow.
 * Sets up initial state and prepares for trading.
 */

import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { ethers } from 'ethers';

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus, DEFAULT_STRATEGY_CONFIG } from '../context.js';

// Type for CopilotKit config parameter (contains threadId)
type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

/**
 * Bootstrap the Polymarket agent workflow.
 *
 * This node:
 * 1. Loads configuration from environment
 * 2. Initializes metrics
 * 3. Sets lifecycle state to 'running'
 */
export async function bootstrapNode(
  state: PolymarketState,
  config: CopilotKitConfig,
): Promise<PolymarketUpdate> {
  logInfo('Bootstrap node starting');

  // Load configuration from environment with defaults
  const strategyConfig = {
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
    minSpread: strategyConfig.minSpreadThreshold,
    maxPosition: strategyConfig.maxPositionSizeUsd,
    maxTotalExposure: strategyConfig.maxTotalExposureUsd,
    pollInterval: strategyConfig.pollIntervalMs,
    minShareSize: strategyConfig.minShareSize,
  });

  // Emit state update to frontend for real-time UI updates
  await copilotkitEmitState(config, {
    view: {
      task,
      lifecycleState: 'running',
      config: strategyConfig,
      events: [statusEvent],
    },
  });

  return {
    view: {
      task,
      lifecycleState: 'running',
      config: strategyConfig,
      events: [statusEvent],
    },
    private: {
      bootstrapped: true,
      pollIntervalMs: strategyConfig.pollIntervalMs,
      walletAddress,
    },
  };
}
