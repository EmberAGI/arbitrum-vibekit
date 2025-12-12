import { type ClmmState } from '../context.js';

/**
 * No-op sync node.
 *
 * Returns the current LangGraph state snapshot without any mutations.
 * Used by the frontend to fetch current state without triggering any actions.
 *
 * If bootstrap hasn't run yet, routing will run bootstrap first, then come here.
 * This ensures the agent wallet is initialized before returning state.
 */
export function syncStateNode(state: ClmmState): ClmmState {
  return state;
}
