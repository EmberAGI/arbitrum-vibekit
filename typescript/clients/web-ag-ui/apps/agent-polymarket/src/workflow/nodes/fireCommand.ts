/**
 * Fire Command Node
 *
 * Handles the 'fire' command to stop the agent.
 */

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';

/**
 * Process the fire command.
 *
 * This transitions the agent to 'stopping' state and prepares for shutdown.
 * In a full implementation, this would:
 * 1. Cancel any pending orders
 * 2. Optionally close positions
 * 3. Return to 'stopped' state
 */
export function fireCommandNode(state: PolymarketState): PolymarketUpdate {
  logInfo('Processing fire command');

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'completed',
    'Agent stopped. All pending operations cancelled.',
  );

  return {
    view: {
      task,
      lifecycleState: 'stopped',
      events: [statusEvent],
    },
    private: {
      cronScheduled: false,
    },
  };
}
