/**
 * Hire Command Node
 *
 * Handles the 'hire' command to activate the agent.
 */

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';

/**
 * Process the hire command.
 *
 * This transitions the agent from 'disabled' to 'waiting-funds' or 'running'.
 */
export function hireCommandNode(state: PolymarketState): PolymarketUpdate {
  logInfo('Processing hire command');

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    'Agent hired! Initializing Polymarket arbitrage scanning...',
  );

  return {
    view: {
      task,
      lifecycleState: 'waiting-funds',
      onboarding: {
        step: 1,
        totalSteps: 2,
        key: 'hire',
      },
      events: [statusEvent],
    },
  };
}
