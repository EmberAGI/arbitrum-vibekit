/**
 * Run Cycle Command Node
 *
 * Handles the 'cycle' command triggered by cron.
 * Prepares state for pollCycle execution.
 */

import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo } from '../context.js';

// Type for CopilotKit config parameter (contains threadId)
type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

/**
 * Process the run cycle command.
 *
 * This is called from cron jobs to trigger a new arbitrage scan cycle.
 */
export async function runCycleCommandNode(
  state: PolymarketState,
  config: CopilotKitConfig,
): Promise<PolymarketUpdate> {
  const iteration = state.view.metrics.iteration + 1;

  logInfo('Starting cycle', { iteration });

  // Emit state update to frontend for real-time UI updates
  await copilotkitEmitState(config, {
    view: {
      command: 'cycle',
    },
  });

  return {
    view: {
      command: 'cycle',
    },
  };
}
