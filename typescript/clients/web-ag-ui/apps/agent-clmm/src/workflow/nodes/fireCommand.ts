import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { applyAccountingUpdate, createFlowEvent } from '../../accounting/state.js';
import { ARBITRUM_CHAIN_ID } from '../../config/constants.js';
import type { ClmmAction } from '../../domain/types.js';
import { resolveAccountingContextId } from '../accounting.js';
import { getCamelotClient, getOnchainClients } from '../clientFactory.js';
import { buildTaskStatus, isTaskTerminal, logInfo, type ClmmState, type ClmmUpdate } from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { executeDecision } from '../execution.js';
import { appendFlowLogHistory, appendTransactionHistory, loadFlowLogHistory } from '../historyStore.js';
import { applyAccountingToView } from '../viewMapping.js';

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

  const onboardingComplete = Boolean(state.view.operatorConfig && state.view.selectedPool);
  if (!onboardingComplete) {
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      state.view.operatorConfig ? 'failed' : 'canceled',
      state.view.operatorConfig
        ? 'Agent fired, but workflow is missing a selected pool.'
        : 'Agent fired before onboarding completed.',
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        task,
        command: 'fire',
        activity: { events: [statusEvent], telemetry: [] },
        accounting: state.view.accounting,
        profile: state.view.profile,
        metrics: state.view.metrics,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }

  const operatorConfig = state.view.operatorConfig;
  const selectedPool = state.view.selectedPool;
  if (!operatorConfig || !selectedPool) {
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      'failed',
      'Agent fired, but workflow state is missing operatorConfig or selectedPool.',
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        task,
        command: 'fire',
        activity: { events: [statusEvent], telemetry: [] },
        accounting: state.view.accounting,
        profile: state.view.profile,
        metrics: state.view.metrics,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }
  const delegationsBypassActive = state.view.delegationsBypassActive === true;
  const delegationBundle = state.view.delegationBundle;

  if (!delegationsBypassActive && !delegationBundle) {
    const failureMessage =
      'Cannot unwind CLMM position during fire: missing delegation bundle. Complete onboarding and approve delegations, or enable DELEGATIONS_BYPASS to execute from the agent wallet.';
    const { task, statusEvent } = buildTaskStatus(currentTask, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        task,
        command: 'fire',
        activity: { events: [statusEvent], telemetry: [] },
        accounting: state.view.accounting,
        profile: state.view.profile,
        metrics: state.view.metrics,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }

  const { task: workingTask, statusEvent: workingEvent } = buildTaskStatus(
    currentTask,
    'working',
    'Firing agent: withdrawing liquidity and stopping CLMM workflow.',
  );
  await copilotkitEmitState(config, {
    view: { task: workingTask, activity: { events: [workingEvent], telemetry: [] } },
  });

  const camelotClient = getCamelotClient();
  let txHash: string | undefined;
  let executionFlowEvents: Array<ReturnType<typeof createFlowEvent>> = [];
  try {
    const clients = await getOnchainClients();
    const action: ClmmAction = {
      kind: 'exit-range',
      reason: 'Agent fired; withdrawing liquidity and stopping workflow.',
    };
    const outcome = await executeDecision({
      action,
      camelotClient,
      pool: selectedPool,
      operatorConfig,
      fundingTokenAddress: state.view.fundingTokenInput?.fundingTokenAddress,
      delegationsBypassActive,
      delegationBundle: delegationsBypassActive ? undefined : delegationBundle,
      clients,
    });
    txHash = outcome.txHash;

    const contextId = resolveAccountingContextId({ state, threadId });
    if (contextId && outcome.flowEvents && outcome.flowEvents.length > 0) {
      executionFlowEvents = outcome.flowEvents.map((event) =>
        createFlowEvent({
          ...event,
          contextId,
          transactionHash: event.transactionHash ?? (txHash as `0x${string}` | undefined),
        }),
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      'failed',
      `Agent fired, but unwinding CLMM position failed: ${message}`,
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        task,
        command: 'fire',
        activity: { events: [statusEvent], telemetry: [] },
        accounting: state.view.accounting,
        profile: state.view.profile,
        metrics: state.view.metrics,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }

  const terminalState = 'completed';
  const terminalMessage = txHash
    ? `Agent fired. Unwound CLMM position (tx=${txHash}).`
    : 'Agent fired. No unwind transactions were required.';
  const { task, statusEvent } = buildTaskStatus(currentTask, terminalState, terminalMessage);

  const contextId = resolveAccountingContextId({ state, threadId });
  const aumUsd = state.view.accounting.aumUsd ?? state.view.accounting.latestNavSnapshot?.totalUsd;
  let accountingBase = state.view.accounting;
  const storedFlowLog = threadId ? await loadFlowLogHistory({ threadId }) : [];
  if (storedFlowLog.length > 0) {
    accountingBase = { ...accountingBase, flowLog: storedFlowLog };
  }
  let accounting = accountingBase;
  if (contextId) {
    const flowEvents = [
      ...executionFlowEvents,
      ...(aumUsd !== undefined
        ? [
            createFlowEvent({
              type: 'fire',
              contextId,
              chainId: ARBITRUM_CHAIN_ID,
              usdValue: aumUsd,
            }),
          ]
        : []),
    ];
    if (flowEvents.length > 0) {
      await appendFlowLogHistory({ threadId, events: flowEvents });
      accounting = applyAccountingUpdate({
        existing: accountingBase,
        flowEvents,
      });
    }
  } else {
    logInfo('Accounting fire event skipped: missing accounting contextId', {});
  }

  const transactionEntry =
    txHash
      ? {
          cycle: state.view.metrics.iteration,
          action: 'withdraw',
          txHash,
          status: 'success' as const,
          reason: 'Unwound CLMM position during fire.',
          timestamp: new Date().toISOString(),
        }
      : undefined;
  if (transactionEntry) {
    await appendTransactionHistory({ threadId, transactions: [transactionEntry] });
  }

  await copilotkitEmitState(config, {
    view: {
      task,
      activity: { events: [statusEvent], telemetry: [] },
      transactionHistory: transactionEntry
        ? [...state.view.transactionHistory, transactionEntry]
        : state.view.transactionHistory,
    },
  });

  const { profile, metrics } = applyAccountingToView({
    profile: state.view.profile,
    metrics: state.view.metrics,
    accounting,
  });

  return {
    view: {
      task,
      command: 'fire',
      activity: { events: [statusEvent], telemetry: [] },
      accounting,
      profile,
      metrics,
      transactionHistory: transactionEntry
        ? [...state.view.transactionHistory, transactionEntry]
        : state.view.transactionHistory,
    },
  };
};
