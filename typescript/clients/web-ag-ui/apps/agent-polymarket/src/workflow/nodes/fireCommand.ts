/**
 * Fire Command Node
 *
 * Handles the 'fire' command to stop the agent.
 */

import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo, buildTaskStatus } from '../context.js';
import { stopCron } from '../../agent.js';

// Type for CopilotKit config parameter (contains threadId)
type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

/**
 * Process the fire command.
 *
 * This transitions the agent to 'stopping' state and prepares for shutdown.
 * In a full implementation, this would:
 * 1. Cancel any pending orders
 * 2. Optionally close positions
 * 3. Return to 'stopped' state
 */
export async function fireCommandNode(
  state: PolymarketState,
  config: CopilotKitConfig,
): Promise<PolymarketUpdate> {
  logInfo('Processing fire command');

  // Stop the cron scheduler to prevent further poll cycles
  const threadId = (config as Configurable).configurable?.thread_id;
  if (threadId) {
    stopCron(threadId);
    logInfo('Cron scheduler stopped on fire', { threadId });
  }

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'completed',
    'Agent stopped. All pending operations cancelled.',
  );

  // Emit state update to frontend for real-time UI updates
  await copilotkitEmitState(config, {
    view: {
      task,
      lifecycleState: 'stopped',
      events: [statusEvent],
    },
  });

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
