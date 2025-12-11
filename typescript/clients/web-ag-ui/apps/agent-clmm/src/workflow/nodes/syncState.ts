import { type ClmmState } from '../context.js';

/**
 * No-op sync node.
 *
 * When a sync command is issued after bootstrap has already run for the thread,
 * we simply accept the incoming LangGraph state snapshot and finish without
 * mutating it. If bootstrap has not run yet, routing logic will send the flow
 * through the bootstrap node instead.
 */
export function syncStateNode(state: ClmmState): ClmmState {
  return state;
}
