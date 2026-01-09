/**
 * Run Cycle Command Node
 *
 * Handles the 'cycle' command triggered by cron.
 * Prepares state for pollCycle execution.
 */

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo } from '../context.js';

/**
 * Process the run cycle command.
 *
 * This is called from cron jobs to trigger a new arbitrage scan cycle.
 */
export function runCycleCommandNode(state: PolymarketState): PolymarketUpdate {
  const iteration = state.view.metrics.iteration + 1;

  logInfo('Starting cycle', { iteration });

  return {
    view: {
      command: 'cycle',
    },
  };
}
