/**
 * Sync State Node
 *
 * Refreshes and returns the current agent state.
 */

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';

/**
 * Sync the current state.
 *
 * This node is called when:
 * - User requests a state refresh
 * - After bootstrap for initial state return
 * - Periodic sync checks
 */
export function syncStateNode(state: PolymarketState): PolymarketUpdate {
  logInfo('Syncing state', {
    lifecycle: state.view.lifecycleState,
    iteration: state.view.metrics.iteration,
    positions: state.view.positions.length,
  });

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'completed',
    `State synced. Lifecycle: ${state.view.lifecycleState}, Positions: ${state.view.positions.length}`,
  );

  return {
    view: {
      task,
      events: [statusEvent],
    },
  };
}
