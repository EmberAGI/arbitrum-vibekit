import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { applyAccountingUpdate, createFlowEvent } from '../../accounting/state.js';
import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
import { resolveAccountingContextId } from '../accounting.js';
import { buildTaskStatus, isTaskTerminal, logInfo, type ClmmState, type ClmmUpdate } from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { appendFlowLogHistory, loadFlowLogHistory } from '../historyStore.js';

type Configurable = { configurable?: { thread_id?: string } };

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const fireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const currentTask = state.view.task;
  const threadId = (config as Configurable).configurable?.thread_id;
  if (threadId) {
    cancelCronForThread(threadId);
  }

  if (currentTask && isTaskTerminal(currentTask.taskStatus.state)) {
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      currentTask.taskStatus.state,
      `Task ${currentTask.id} is already in a terminal state.`,
    );
    await copilotkitEmitState(config, { view: { task, activity: { events: [statusEvent], telemetry: [] } } });
    return {
      view: {
        task,
        activity: { events: [statusEvent], telemetry: [] },
        command: 'fire',
      },
    };
  }

  const onboardingComplete = Boolean(state.view.operatorConfig);
  const terminalState = onboardingComplete ? 'completed' : 'canceled';
  const terminalMessage = onboardingComplete
    ? 'Agent fired. Workflow completed.'
    : 'Agent fired before onboarding completed.';
  const { task, statusEvent } = buildTaskStatus(currentTask, terminalState, terminalMessage);
  await copilotkitEmitState(config, { view: { task, activity: { events: [statusEvent], telemetry: [] } } });

  const contextId = resolveAccountingContextId({ state, threadId });
  const aumUsd = state.view.accounting.aumUsd ?? state.view.accounting.latestNavSnapshot?.totalUsd;
  let accountingBase = state.view.accounting;
  const storedFlowLog = threadId ? await loadFlowLogHistory({ threadId }) : [];
  if (storedFlowLog.length > 0) {
    accountingBase = { ...accountingBase, flowLog: storedFlowLog };
  }
  let accounting = accountingBase;
  if (contextId && aumUsd !== undefined) {
    const fireEvent = createFlowEvent({
      type: 'fire',
      contextId,
      chainId: ARBITRUM_CHAIN_ID,
      usdValue: aumUsd,
    });
    await appendFlowLogHistory({ threadId, events: [fireEvent] });
    accounting = applyAccountingUpdate({
      existing: accountingBase,
      flowEvents: [fireEvent],
    });
  }
  if (!contextId) {
    logInfo('Accounting fire event skipped: missing threadId', {});
  }

  return {
    view: {
      task,
      command: 'fire',
      activity: { events: [statusEvent], telemetry: [] },
      accounting,
    },
  };
};
