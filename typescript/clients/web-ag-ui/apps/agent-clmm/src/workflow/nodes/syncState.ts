import { appendNavSnapshots } from '../../accounting/state.js';
import { createCamelotAccountingSnapshot } from '../accounting.js';
import { getCamelotClient } from '../clientFactory.js';
import { logInfo, type ClmmState, type ClmmUpdate } from '../context.js';

/**
 * No-op sync node.
 *
 * Returns the current LangGraph state snapshot without any mutations.
 * Used by the frontend to fetch current state without triggering any actions.
 *
 * If bootstrap hasn't run yet, routing will run bootstrap first, then come here.
 * This ensures the agent wallet is initialized before returning state.
 */
export async function syncStateNode(state: ClmmState): Promise<ClmmState | ClmmUpdate> {
  const camelotClient = getCamelotClient();

  try {
    const snapshot = await createCamelotAccountingSnapshot({
      state,
      camelotClient,
      trigger: 'sync',
    });
    if (!snapshot) {
      return state;
    }
    const accounting = appendNavSnapshots(state.view.accounting, [snapshot]);
    return { view: { accounting } };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    logInfo('Accounting sync failed', { error: message });
    return state;
  }
}
