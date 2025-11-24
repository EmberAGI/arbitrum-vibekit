/**
 * Radiant V2 Lending Protocol Plugin
 * 
 * This plugin provides a complete TypeScript interface for interacting with
 * Radiant Capital's lending protocol on Arbitrum.
 * 
 * Features:
 * - Fetch real-time market data (APRs, liquidity, prices)
 * - Query user positions (collateral, debt, health factor)
 * - Build lending transactions (supply, withdraw, borrow, repay, setCollateral)
 * 
 * All transaction builders return calldata only - they don't execute transactions.
 * The caller is responsible for signing and sending transactions.
 * 
 * @example
 * ```typescript
 * import { radiantPlugin } from './src/index.js';
 * 
 * // Fetch markets
 * const markets = await radiantPlugin.actions.fetchMarkets();
 * 
 * // Get user position
 * const position = await radiantPlugin.actions.getUserPosition('0x...');
 * 
 * // Build supply transaction
 * const tx = radiantPlugin.actions.supply({
 *   token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
 *   amount: '1000000'
 * });
 * ```
 */

import { fetchMarkets } from './markets.js';
import { getUserPosition } from './positions.js';
import { supply, withdraw, borrow, repay, setCollateral } from './actions.js';

/**
 * Main plugin export
 * Contains all available actions for Radiant protocol
 */
export const radiantPlugin = {
  id: 'radiant',
  chains: [42161],  // Arbitrum One
  actions: {
    fetchMarkets,      // Query market data
    getUserPosition,   // Query user positions
    supply,            // Build supply transaction
    withdraw,          // Build withdraw transaction
    borrow,            // Build borrow transaction
    repay,             // Build repay transaction
    setCollateral      // Build setCollateral transaction
  }
};

// Export individual functions for direct imports
export { fetchMarkets, getUserPosition, supply, withdraw, borrow, repay, setCollateral };

// Export TypeScript types
export type { MarketInfo } from './markets.js';
export type { UserPosition } from './positions.js';
export type { TxBuildResult } from './actions.js';
