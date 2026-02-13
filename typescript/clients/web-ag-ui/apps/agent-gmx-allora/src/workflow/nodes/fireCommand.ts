import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { ARBITRUM_CHAIN_ID, resolveGmxAlloraTxExecutionMode } from '../../config/constants.js';
import type { ExecutionPlan } from '../../core/executionPlan.js';
import type { PerpetualPosition } from '../../clients/onchainActions.js';
import { buildTaskStatus, isTaskTerminal, logInfo, type ClmmState, type ClmmUpdate } from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { getOnchainActionsClient, getOnchainClients } from '../clientFactory.js';
import { executePerpetualPlan } from '../execution.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

function hasOpenPosition(position: PerpetualPosition | undefined): boolean {
  if (!position) {
    return false;
  }
  // onchain-actions uses decimal strings; treat "0" (and variants) as closed.
  return position.sizeInUsd.trim() !== '' && position.sizeInUsd !== '0';
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

  logInfo('Fire command requested; attempting to close any open GMX position', {
    threadId,
    delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
    marketAddress: operatorConfig.targetMarket.address,
    delegationsBypassActive: state.view.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    configuredTxMode: resolveGmxAlloraTxExecutionMode(),
  });

  if (state.view.delegationsBypassActive !== true && !state.view.delegationBundle) {
    const failureMessage =
      'Cannot close GMX position during fire: missing delegation bundle. Complete onboarding and approve delegations, or enable DELEGATIONS_BYPASS to execute from the agent wallet.';
    const { task, statusEvent } = buildTaskStatus(currentTask, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: { task, command: 'fire', activity: { events: [statusEvent], telemetry: [] } },
    };
  }

  const onchainActionsClient = getOnchainActionsClient();

  let positions: PerpetualPosition[] = [];
  try {
    positions = await onchainActionsClient.listPerpetualPositions({
      walletAddress: operatorConfig.delegatorWalletAddress,
      chainIds: [ARBITRUM_CHAIN_ID.toString()],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      'failed',
      `Failed to fetch GMX positions while firing: ${message}`,
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

  const normalizedMarket = operatorConfig.targetMarket.address.toLowerCase();
  const positionToClose = positions.find(
    (position) => position.marketAddress.toLowerCase() === normalizedMarket,
  );

  if (!hasOpenPosition(positionToClose)) {
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      'completed',
      'Agent fired. No open GMX position detected.',
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

  const plan: ExecutionPlan = {
    action: 'close',
    request: {
      walletAddress: operatorConfig.delegatorWalletAddress,
      marketAddress: operatorConfig.targetMarket.address,
      positionSide: positionToClose.positionSide,
    },
  };

  // Fire should be a real unwind action. Even if the agent is configured in plan-only mode
  // for cycles, we attempt to execute the close here. If the local environment cannot
  // execute (missing signer), we fail loudly with a concrete message.
  const txExecutionMode: 'execute' = 'execute';
  let clients: ReturnType<typeof getOnchainClients>;
  try {
    clients = getOnchainClients();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failureMessage = `Cannot execute GMX close during fire: ${message}`;
    const { task, statusEvent } = buildTaskStatus(currentTask, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: { task, command: 'fire', activity: { events: [statusEvent], telemetry: [] } },
    };
  }

  const executionResult = await executePerpetualPlan({
    client: onchainActionsClient,
    clients,
    plan,
    txExecutionMode,
    delegationsBypassActive: state.view.delegationsBypassActive === true,
    delegationBundle: state.view.delegationBundle,
    delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
    delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
  });

  const nextTransactionHistory = (() => {
    const txHash = executionResult.lastTxHash;
    if (!txHash) {
      return state.view.transactionHistory;
    }
    return [
      ...state.view.transactionHistory,
      {
        cycle: state.view.metrics.iteration,
        action: 'close',
        txHash,
        status: executionResult.ok ? ('success' as const) : ('failed' as const),
        reason: executionResult.ok ? 'Closed GMX position during fire.' : executionResult.error,
        timestamp: new Date().toISOString(),
      },
    ];
  })();

  const terminalState = executionResult.ok ? 'completed' : 'failed';
  const terminalMessage = executionResult.ok
    ? 'Agent fired. Closed GMX position.'
    : `Agent fired, but closing GMX position failed: ${executionResult.error ?? 'Unknown error'}`;

  const { task, statusEvent } = buildTaskStatus(currentTask, terminalState, terminalMessage);
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: [] }, transactionHistory: nextTransactionHistory },
  });

  return {
    view: {
      task,
      command: 'fire',
      activity: { events: [statusEvent], telemetry: [] },
      transactionHistory: nextTransactionHistory,
    },
  };
};
