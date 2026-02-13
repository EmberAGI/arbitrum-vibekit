import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { resolvePendleChainIds, resolvePendleTxExecutionMode } from '../../config/constants.js';
import { getOnchainActionsClient, getOnchainClients } from '../clientFactory.js';
import { buildTaskStatus, isTaskTerminal, type ClmmState, type ClmmUpdate } from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { executeUnwind } from '../execution.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

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
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        task,
        activity: { events: [statusEvent], telemetry: [] },
        command: 'fire',
      },
    };
  }

  const operatorConfig = state.view.operatorConfig;
  if (!operatorConfig) {
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      'canceled',
      'Agent fired before onboarding completed.',
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        task,
        command: 'fire',
        activity: { events: [statusEvent], telemetry: [] },
      },
    };
  }

  const txExecutionMode = resolvePendleTxExecutionMode();
  const onchainActionsClient = getOnchainActionsClient();
  const chainIds = resolvePendleChainIds();
  const clients = txExecutionMode === 'execute' ? getOnchainClients() : undefined;
  const delegationBundle =
    state.view.delegationsBypassActive === true ? undefined : state.view.delegationBundle;

  const emitWorking = async (message: string) => {
    const { task, statusEvent } = buildTaskStatus(currentTask, 'working', message);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
  };

  await emitWorking('Agent fired. Starting unwind of all managed Pendle positions.');

  try {
    const unwindResult = await executeUnwind({
      onchainActionsClient,
      txExecutionMode,
      clients,
      delegationBundle,
      walletAddress: operatorConfig.executionWalletAddress,
      chainIds,
      maxRetries: 2,
      onProgress: async (message) => emitWorking(message),
    });

    const unwindTxHashes = unwindResult.txHashes;
    const unwindTimestamp = new Date().toISOString();
    const unwindCycle = state.view.metrics.iteration ?? 0;
    const unwindTransactions =
      unwindTxHashes.length > 0
        ? unwindTxHashes.map((txHash) => ({
            cycle: unwindCycle,
            action: 'unwind',
            txHash,
            status: 'success' as const,
            reason: 'fire',
            timestamp: unwindTimestamp,
          }))
        : [];
    const transactionHistory =
      unwindTransactions.length > 0
        ? [...state.view.transactionHistory, ...unwindTransactions]
        : state.view.transactionHistory;

    const lastUnwindTxHash = unwindResult.lastTxHash ?? unwindTxHashes.at(-1);
    const completionMessage =
      unwindResult.positionCount === 0
        ? 'Agent fired. No positions found to unwind. Workflow completed.'
        : unwindResult.transactionCount === 0
          ? `Agent fired. Nothing to unwind for ${unwindResult.positionCount} position(s). Workflow completed.`
          : lastUnwindTxHash
            ? `Agent fired. Unwind complete for ${unwindResult.positionCount} position(s) (${unwindResult.transactionCount} transaction(s) planned). Workflow completed. Last tx: ${lastUnwindTxHash}`
            : `Agent fired. Unwind complete for ${unwindResult.positionCount} position(s) (${unwindResult.transactionCount} transaction(s) planned). Workflow completed.`;
    const { task, statusEvent } = buildTaskStatus(currentTask, 'completed', completionMessage);
    await copilotkitEmitState(config, {
      view: {
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        transactionHistory,
      },
    });
    return {
      view: {
        task,
        command: 'fire',
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        transactionHistory,
      },
    };
  } catch (error: unknown) {
    const message = formatErrorMessage(error);
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      'failed',
      `ERROR: Unwind failed after 2 retries: ${message}`,
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        task,
        command: 'fire',
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    };
  }
};
