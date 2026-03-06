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
  const currentTask = state.thread.task;
  const threadId = (config as Configurable).configurable?.thread_id;
  if (threadId) {
    cancelCronForThread(threadId);
  }

  if (currentTask && isTaskTerminal(currentTask.taskStatus.state) && currentTask.taskStatus.state !== 'failed') {
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      currentTask.taskStatus.state,
      `Task ${currentTask.id} is already in a terminal state.`,
    );
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      thread: {
        task,
        activity: { events: [statusEvent], telemetry: [] },
        lifecycle: { phase: 'inactive' },
      },
    };
  }

  const operatorConfig = state.thread.operatorConfig;
  if (!operatorConfig) {
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      'canceled',
      'Agent fired before onboarding completed.',
    );
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      thread: {
        task,
        lifecycle: { phase: 'inactive' },
        activity: { events: [statusEvent], telemetry: [] },
      },
    };
  }

  const txExecutionMode = resolvePendleTxExecutionMode();
  const onchainActionsClient = getOnchainActionsClient();
  const chainIds = resolvePendleChainIds();
  const clients = txExecutionMode === 'execute' ? getOnchainClients() : undefined;
  const delegationBundle =
    state.thread.delegationsBypassActive === true ? undefined : state.thread.delegationBundle;
  const hasSetupTransaction = state.thread.transactionHistory.some(
    (entry) => entry.action === 'setup' && entry.status === 'success',
  );
  const positionLookupAttempts = hasSetupTransaction ? 20 : 1;
  const positionLookupDelayMs = hasSetupTransaction ? 3_000 : 0;

  const emitWorking = async (message: string) => {
    const { task, statusEvent } = buildTaskStatus(currentTask, 'working', message);
    await copilotkitEmitState(config, {
      thread: {
        task,
        lifecycle: { phase: 'firing' },
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      },
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
      positionLookupAttempts,
      positionLookupDelayMs,
      onProgress: async (message) => emitWorking(message),
    });

    const unwindTxHashes = unwindResult.txHashes;
    const unwindTimestamp = new Date().toISOString();
    const unwindCycle = state.thread.metrics.iteration ?? 0;
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
        ? [...state.thread.transactionHistory, ...unwindTransactions]
        : state.thread.transactionHistory;

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
      thread: {
        task,
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        transactionHistory,
      },
    });
    return {
      thread: {
        task,
        lifecycle: { phase: 'inactive' },
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        transactionHistory,
      },
    };
  } catch (error: unknown) {
    const message = formatErrorMessage(error);
    const normalized = message.trim().toLowerCase();
    if (normalized === 'interrupt') {
      const { task, statusEvent } = buildTaskStatus(
        currentTask,
        'completed',
        'Agent fired. Unwind was interrupted before completion; no onchain changes were confirmed. Workflow completed.',
      );
      await copilotkitEmitState(config, {
        thread: { task, activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry } },
      });
      return {
        thread: {
          task,
          lifecycle: { phase: 'inactive' },
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        },
      };
    }

    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      'failed',
      `ERROR: Unwind failed after 2 retries: ${message}`,
    );
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry } },
    });
    return {
      thread: {
        task,
        lifecycle: { phase: 'inactive' },
        activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      },
    };
  }
};
