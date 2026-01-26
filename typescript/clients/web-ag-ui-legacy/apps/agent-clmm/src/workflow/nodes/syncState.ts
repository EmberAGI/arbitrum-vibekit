import { applyAccountingUpdate } from '../../accounting/state.js';
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
type Configurable = { configurable?: { thread_id?: string } };

export async function syncStateNode(
  state: ClmmState,
  config?: Configurable,
): Promise<ClmmState | ClmmUpdate> {
  const camelotClient = getCamelotClient();
  const threadId = config?.configurable?.thread_id;
  if (!threadId) {
    logInfo('Accounting sync skipped: missing threadId', {});
    return state;
  }

  try {
    const snapshot = await createCamelotAccountingSnapshot({
      state,
      camelotClient,
      trigger: 'sync',
      threadId,
    });
    if (!snapshot) {
      return state;
    }
    const accounting = applyAccountingUpdate({
      existing: state.view.accounting,
      snapshots: [snapshot],
    });
    return { view: { accounting } };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    logInfo('Accounting sync failed', { error: message });
    return state;
  }
}
