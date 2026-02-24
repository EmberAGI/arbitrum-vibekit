import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import type { PerpetualPosition } from '../../clients/onchainActions.js';
import {
  ARBITRUM_CHAIN_ID,
  resolveGmxAlloraMode,
  resolveGmxAlloraTxExecutionMode,
} from '../../config/constants.js';
import type { ExecutionPlan } from '../../core/executionPlan.js';
import { getOnchainActionsClient, getOnchainClients } from '../clientFactory.js';
import {
  buildTaskStatus,
  isTaskTerminal,
  logInfo,
  logWarn,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';
import { executePerpetualPlan } from '../execution.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};
const shouldLogFireDebug =
  process.env.GMX_FIRE_DEBUG === 'true' || resolveGmxAlloraMode() === 'debug';
const DEFAULT_FIRE_CLOSE_VERIFY_ATTEMPTS = 15;
const DEFAULT_FIRE_CLOSE_VERIFY_INTERVAL_MS = 2_000;
const GMX_EVENT_EMITTER_ADDRESS = '0xc8ee91a54287db53897056e12d9819156d3822fb';
const GMX_EVENT_LOG2_TOPIC = '0x468a25a7ba624ceea6e540ad6f49171b52495b648417ae91bca21676d8a24dc5';
const GMX_ORDER_CREATED_TOPIC = '0xa7427759bfd3b941f14e687e129519da3c9b0046c5b9aaa290bb1dede63753b3';
const GMX_ORDER_CANCELLED_TOPIC = '0xc7bb288dfd646d5b6c69d5099dd75b72f9c8c09ec9d40984c8ad8182357ae4b2';
const GMX_ORDER_EXECUTED_TOPIC = '0x680f10f06595d3d707241f604672ec4b6ae50eb82728ec2f3c65f6789e897760';
const GMX_ORDER_NOT_FULFILLABLE_AT_ACCEPTABLE_PRICE_SELECTOR = 'e09ad0e9';

type HexValue = `0x${string}`;
type ReceiptLogLike = {
  address: string;
  topics: readonly string[];
  data: string;
  transactionHash: string | null;
  blockNumber?: bigint | null;
  logIndex?: number | bigint | null;
};
type TransactionReceiptLike = {
  blockNumber: bigint;
  logs: readonly ReceiptLogLike[];
};
type PublicClientLike = {
  getTransactionReceipt(args: { hash: HexValue }): Promise<TransactionReceiptLike>;
  getLogs(args: {
    address: HexValue;
    fromBlock: bigint;
    toBlock: 'latest';
    topics: readonly [HexValue, readonly HexValue[], HexValue];
  }): Promise<readonly ReceiptLogLike[]>;
};
type CloseOrderLifecycle = {
  status: 'unknown' | 'executed' | 'cancelled';
  orderKey?: HexValue;
  txHash?: HexValue;
  cancelReason?: string;
};

function logFireDebug(message: string, metadata?: Record<string, unknown>): void {
  if (!shouldLogFireDebug) {
    return;
  }
  logInfo(message, metadata, { force: true });
}

function normalizeHex(value: string | undefined): string {
  return value?.toLowerCase() ?? '';
}

function asHexValue(value: string): HexValue | undefined {
  if (!value.startsWith('0x')) {
    return undefined;
  }
  return value as HexValue;
}

function buildAddressTopic(address: `0x${string}`): HexValue {
  const stripped = address.slice(2).toLowerCase();
  return `0x${stripped.padStart(64, '0')}`;
}

function isPublicClientLike(value: unknown): value is PublicClientLike {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['getTransactionReceipt'] === 'function' &&
    typeof candidate['getLogs'] === 'function'
  );
}

function decodeKnownCancelReason(data: string): string | undefined {
  const hex = data.startsWith('0x') ? data.slice(2).toLowerCase() : data.toLowerCase();
  const selectorIndex = hex.indexOf(GMX_ORDER_NOT_FULFILLABLE_AT_ACCEPTABLE_PRICE_SELECTOR);
  if (selectorIndex < 0) {
    return undefined;
  }

  const argStart = selectorIndex + GMX_ORDER_NOT_FULFILLABLE_AT_ACCEPTABLE_PRICE_SELECTOR.length;
  const acceptablePriceHex = hex.slice(argStart, argStart + 64);
  const triggerPriceHex = hex.slice(argStart + 64, argStart + 128);
  if (acceptablePriceHex.length !== 64 || triggerPriceHex.length !== 64) {
    return 'OrderNotFulfillableAtAcceptablePrice';
  }

  try {
    const acceptablePrice = BigInt(`0x${acceptablePriceHex}`);
    const triggerPrice = BigInt(`0x${triggerPriceHex}`);
    return `OrderNotFulfillableAtAcceptablePrice(acceptablePrice=${acceptablePrice.toString()}, triggerPrice=${triggerPrice.toString()})`;
  } catch {
    return 'OrderNotFulfillableAtAcceptablePrice';
  }
}

function extractCloseOrderKeysFromReceipt(params: {
  receipt: TransactionReceiptLike;
  delegatorWalletAddress: `0x${string}`;
}): HexValue[] {
  const delegatorTopic = buildAddressTopic(params.delegatorWalletAddress);
  const keys = new Set<HexValue>();

  for (const log of params.receipt.logs) {
    const address = normalizeHex(log.address);
    if (address !== GMX_EVENT_EMITTER_ADDRESS) {
      continue;
    }

    const topic0 = normalizeHex(log.topics[0]);
    const topic1 = normalizeHex(log.topics[1]);
    const topic2 = log.topics[2];
    const topic3 = normalizeHex(log.topics[3]);
    if (topic0 !== GMX_EVENT_LOG2_TOPIC || topic1 !== GMX_ORDER_CREATED_TOPIC) {
      continue;
    }
    if (topic3 !== delegatorTopic) {
      continue;
    }

    const orderKey = topic2 ? asHexValue(topic2) : undefined;
    if (orderKey) {
      keys.add(orderKey);
    }
  }

  return [...keys];
}

async function resolveCloseOrderLifecycle(params: {
  publicClient: PublicClientLike;
  fromBlock: bigint;
  orderKeys: readonly HexValue[];
}): Promise<CloseOrderLifecycle> {
  for (const orderKey of params.orderKeys) {
    const logs = await params.publicClient.getLogs({
      address: GMX_EVENT_EMITTER_ADDRESS as HexValue,
      fromBlock: params.fromBlock,
      toBlock: 'latest',
      topics: [GMX_EVENT_LOG2_TOPIC as HexValue, [GMX_ORDER_EXECUTED_TOPIC as HexValue, GMX_ORDER_CANCELLED_TOPIC as HexValue], orderKey],
    });

    const matchingLifecycleLogs = logs.filter((log) => {
      const topic0 = normalizeHex(log.topics[0]);
      const topic1 = normalizeHex(log.topics[1]);
      const topic2 = normalizeHex(log.topics[2]);
      const isLifecycleTopic =
        topic1 === GMX_ORDER_EXECUTED_TOPIC || topic1 === GMX_ORDER_CANCELLED_TOPIC;
      return topic0 === GMX_EVENT_LOG2_TOPIC && isLifecycleTopic && topic2 === normalizeHex(orderKey);
    });

    if (matchingLifecycleLogs.length === 0) {
      continue;
    }

    const latest = matchingLifecycleLogs.at(-1);
    if (!latest) {
      continue;
    }

    const topic1 = normalizeHex(latest.topics[1]);
    if (topic1 === GMX_ORDER_CANCELLED_TOPIC) {
      return {
        status: 'cancelled',
        orderKey,
        txHash: latest.transactionHash ? (latest.transactionHash as HexValue) : undefined,
        cancelReason: decodeKnownCancelReason(latest.data),
      };
    }
    if (topic1 === GMX_ORDER_EXECUTED_TOPIC) {
      return {
        status: 'executed',
        orderKey,
        txHash: latest.transactionHash ? (latest.transactionHash as HexValue) : undefined,
      };
    }
  }

  if (params.orderKeys.length > 0) {
    return { status: 'unknown', orderKey: params.orderKeys[0] };
  }
  return { status: 'unknown' };
}

function resolveFireCloseVerifyAttempts(): number {
  const raw = process.env['GMX_FIRE_CLOSE_VERIFY_ATTEMPTS'];
  if (!raw) {
    return DEFAULT_FIRE_CLOSE_VERIFY_ATTEMPTS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_FIRE_CLOSE_VERIFY_ATTEMPTS;
  }
  return Math.max(1, Math.trunc(parsed));
}

function resolveFireCloseVerifyIntervalMs(): number {
  const raw = process.env['GMX_FIRE_CLOSE_VERIFY_INTERVAL_MS'];
  if (!raw) {
    return DEFAULT_FIRE_CLOSE_VERIFY_INTERVAL_MS;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_FIRE_CLOSE_VERIFY_INTERVAL_MS;
  }
  return Math.max(0, Math.trunc(parsed));
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasOpenPosition(position: PerpetualPosition | undefined): position is PerpetualPosition {
  if (!position) {
    return false;
  }
  // onchain-actions uses decimal strings; treat 0-valued strings (e.g. "0", "0.0") as closed.
  const size = position.sizeInUsd.trim();
  if (size.length === 0) {
    return false;
  }

  const parsed = Number(size);
  if (Number.isFinite(parsed)) {
    return Math.abs(parsed) > 0;
  }

  // If parsing fails, fall back to a conservative non-empty check to avoid false negatives.
  return size !== '0';
}

export const fireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const currentTask = state.view.task;
  const runtimeConfig = (config as Configurable).configurable;
  const threadId = runtimeConfig?.thread_id;
  const checkpointId = runtimeConfig?.checkpoint_id;
  const checkpointNamespace = runtimeConfig?.checkpoint_ns;
  logWarn('fireCommand: processing fire request', {
    threadId,
    checkpointId,
    checkpointNamespace,
    onboardingStatus: state.view.onboardingFlow?.status,
    hasOperatorConfig: Boolean(state.view.operatorConfig),
    hasDelegationBundle: Boolean(state.view.delegationBundle),
  });
  logFireDebug('fireCommand: node entered', {
    threadId,
    checkpointId,
    checkpointNamespace,
    hasTask: Boolean(currentTask),
    currentTaskState: currentTask?.taskStatus.state,
    currentCommand: state.view.command,
    onboardingStatus: state.view.onboardingFlow?.status,
    hasOperatorConfig: Boolean(state.view.operatorConfig),
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    delegationsBypassActive: state.view.delegationsBypassActive === true,
  });
  if (threadId) {
    cancelCronForThread(threadId);
  }

  if (currentTask && isTaskTerminal(currentTask.taskStatus.state)) {
    logFireDebug('fireCommand: skipping because task already terminal', {
      threadId,
      taskState: currentTask.taskStatus.state,
      taskId: currentTask.id,
    });
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
    logWarn('fireCommand: onboarding incomplete, terminating fire without close attempt', {
      threadId,
      onboardingStatus: state.view.onboardingFlow?.status,
      onboardingStep: state.view.onboarding?.step,
      onboardingKey: state.view.onboarding?.key,
    });
    logFireDebug('fireCommand: firing before onboarding completion', {
      threadId,
      onboardingStatus: state.view.onboardingFlow?.status,
      onboardingStep: state.view.onboarding?.step,
    });
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

  const txExecutionMode = resolveGmxAlloraTxExecutionMode();
  const willExecute = txExecutionMode === 'execute';

  logInfo('Fire command requested; attempting to close any open GMX position', {
    threadId,
    checkpointId,
    checkpointNamespace,
    delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
    marketAddress: operatorConfig.targetMarket.address,
    delegationsBypassActive: state.view.delegationsBypassActive === true,
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    configuredTxMode: txExecutionMode,
  });

  if (willExecute && state.view.delegationsBypassActive !== true && !state.view.delegationBundle) {
    logFireDebug('fireCommand: missing delegation bundle for execute mode', {
      threadId,
      txExecutionMode,
      delegationsBypassActive: state.view.delegationsBypassActive ?? false,
    });
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
  const matchedPositionSizeUsd = positionToClose?.sizeInUsd;
  logWarn('fireCommand: fetched positions for fire close decision', {
    threadId,
    checkpointId,
    checkpointNamespace,
    targetMarketAddress: normalizedMarket,
    totalPositions: positions.length,
    matchedMarketPosition: Boolean(positionToClose),
    matchedPositionSide: positionToClose?.positionSide,
    matchedPositionSizeUsd,
    txExecutionMode,
  });

  if (!hasOpenPosition(positionToClose)) {
    logWarn('fireCommand: no open target-market position detected; completing fire', {
      threadId,
      targetMarketAddress: normalizedMarket,
      totalPositions: positions.length,
      matchedMarketPosition: Boolean(positionToClose),
      matchedPositionSizeUsd,
    });
    logFireDebug('fireCommand: no open GMX position found; completing fire', {
      threadId,
      targetMarketAddress: operatorConfig.targetMarket.address,
      discoveredPositionCount: positions.length,
    });
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

  const closeRequest = {
    walletAddress: operatorConfig.delegatorWalletAddress,
    marketAddress: operatorConfig.targetMarket.address,
    positionSide: positionToClose.positionSide,
    isLimit: false,
  };

  const plan: ExecutionPlan = {
    action: 'close',
    request: closeRequest,
  };
  logWarn('fireCommand: prepared close execution plan', {
    threadId,
    checkpointId,
    checkpointNamespace,
    action: plan.action,
    walletAddress: closeRequest.walletAddress,
    marketAddress: closeRequest.marketAddress,
    positionSide: closeRequest.positionSide,
    txExecutionMode,
  });

  const clients = (() => {
    if (!willExecute) {
      return undefined;
    }
    try {
      return getOnchainClients();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cannot execute GMX close during fire: ${message}`);
    }
  })();

  const executionResult = await (async () => {
    try {
      return await executePerpetualPlan({
        client: onchainActionsClient,
        clients,
        plan,
        txExecutionMode,
        delegationsBypassActive: state.view.delegationsBypassActive === true,
        delegationBundle: state.view.delegationBundle,
        delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
        delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { action: plan.action, ok: false as const, error: message };
    }
  })();
  logWarn('fireCommand: close execution result', {
    threadId,
    checkpointId,
    checkpointNamespace,
    ok: executionResult.ok,
    action: executionResult.action,
    txHash: executionResult.lastTxHash,
    txHashes: executionResult.txHashes,
    error: executionResult.ok ? undefined : executionResult.error,
  });

  let closeConfirmedOnchain = false;
  let closeConfirmationError: string | undefined;
  let postCloseTotalPositions = 0;
  let postCloseMatchedMarketPosition = false;
  let postCloseMatchedPositionSide: PerpetualPosition['positionSide'] | undefined;
  let postCloseMatchedPositionSizeUsd: string | undefined;
  let verificationAttemptsCompleted = 0;
  const maxVerificationAttempts = resolveFireCloseVerifyAttempts();
  const verificationIntervalMs = resolveFireCloseVerifyIntervalMs();
  let closeOrderLifecycle: CloseOrderLifecycle = { status: 'unknown' };
  let closeOrderSubmissionBlock: bigint | undefined;
  let closeOrderKeys: HexValue[] = [];
  const publicClient = isPublicClientLike(clients?.public) ? clients.public : undefined;

  if (executionResult.ok && willExecute) {
    if (publicClient && executionResult.lastTxHash) {
      try {
        const closeSubmissionReceipt = await publicClient.getTransactionReceipt({
          hash: executionResult.lastTxHash,
        });
        closeOrderSubmissionBlock = closeSubmissionReceipt.blockNumber;
        closeOrderKeys = extractCloseOrderKeysFromReceipt({
          receipt: closeSubmissionReceipt,
          delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
        });
        if (closeOrderKeys.length > 0) {
          closeOrderLifecycle = {
            status: 'unknown',
            orderKey: closeOrderKeys[0],
          };
        }
        logWarn('fireCommand: close submission receipt inspected for order lifecycle', {
          threadId,
          checkpointId,
          checkpointNamespace,
          submissionTxHash: executionResult.lastTxHash,
          submissionBlock: closeOrderSubmissionBlock.toString(),
          closeOrderKeys,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logWarn('fireCommand: failed to inspect close submission receipt for order lifecycle', {
          threadId,
          checkpointId,
          checkpointNamespace,
          submissionTxHash: executionResult.lastTxHash,
          error: message,
        });
      }
    }

    for (let attempt = 1; attempt <= maxVerificationAttempts; attempt += 1) {
      verificationAttemptsCompleted = attempt;
      try {
        const postClosePositions = await onchainActionsClient.listPerpetualPositions({
          walletAddress: operatorConfig.delegatorWalletAddress,
          chainIds: [ARBITRUM_CHAIN_ID.toString()],
        });
        postCloseTotalPositions = postClosePositions.length;
        const postClosePosition = postClosePositions.find(
          (position) => position.marketAddress.toLowerCase() === normalizedMarket,
        );
        postCloseMatchedMarketPosition = Boolean(postClosePosition);
        postCloseMatchedPositionSide = postClosePosition?.positionSide;
        postCloseMatchedPositionSizeUsd = postClosePosition?.sizeInUsd;
        closeConfirmedOnchain = !hasOpenPosition(postClosePosition);
      } catch (error: unknown) {
        closeConfirmationError = error instanceof Error ? error.message : String(error);
        logWarn('fireCommand: post-close position verification failed', {
          threadId,
          checkpointId,
          checkpointNamespace,
          attempt,
          maxVerificationAttempts,
          verificationIntervalMs,
          targetMarketAddress: normalizedMarket,
          error: closeConfirmationError,
        });
        break;
      }

      if (
        publicClient &&
        closeOrderSubmissionBlock !== undefined &&
        closeOrderKeys.length > 0 &&
        closeOrderLifecycle.status === 'unknown'
      ) {
        try {
          closeOrderLifecycle = await resolveCloseOrderLifecycle({
            publicClient,
            fromBlock: closeOrderSubmissionBlock,
            orderKeys: closeOrderKeys,
          });
          if (closeOrderLifecycle.status !== 'unknown') {
            logWarn('fireCommand: close order lifecycle event observed', {
              threadId,
              checkpointId,
              checkpointNamespace,
              attempt,
              closeOrderLifecycleStatus: closeOrderLifecycle.status,
              closeOrderLifecycleOrderKey: closeOrderLifecycle.orderKey,
              closeOrderLifecycleTxHash: closeOrderLifecycle.txHash,
              closeOrderLifecycleReason: closeOrderLifecycle.cancelReason,
            });
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          logWarn('fireCommand: close order lifecycle check failed', {
            threadId,
            checkpointId,
            checkpointNamespace,
            attempt,
            error: message,
          });
        }
      }

      logWarn('fireCommand: post-close position verification snapshot', {
        threadId,
        checkpointId,
        checkpointNamespace,
        attempt,
        maxVerificationAttempts,
        verificationIntervalMs,
        targetMarketAddress: normalizedMarket,
        totalPositions: postCloseTotalPositions,
        matchedMarketPosition: postCloseMatchedMarketPosition,
        matchedPositionSide: postCloseMatchedPositionSide,
        matchedPositionSizeUsd: postCloseMatchedPositionSizeUsd,
        closeConfirmedOnchain,
        closeOrderLifecycleStatus: closeOrderLifecycle.status,
        closeOrderLifecycleOrderKey: closeOrderLifecycle.orderKey,
        closeOrderLifecycleTxHash: closeOrderLifecycle.txHash,
        closeOrderLifecycleReason: closeOrderLifecycle.cancelReason,
      });

      if (closeOrderLifecycle.status === 'cancelled') {
        closeConfirmationError = closeOrderLifecycle.cancelReason
          ? `Close order cancelled onchain: ${closeOrderLifecycle.cancelReason}`
          : 'Close order cancelled onchain before execution.';
        break;
      }

      if (closeConfirmedOnchain) {
        break;
      }

      if (attempt < maxVerificationAttempts) {
        await delay(verificationIntervalMs);
      }
    }

    if (!closeConfirmedOnchain && !closeConfirmationError) {
      logWarn('fireCommand: close not confirmed within verification window', {
        threadId,
        checkpointId,
        checkpointNamespace,
        targetMarketAddress: normalizedMarket,
        verificationAttemptsCompleted,
        maxVerificationAttempts,
        verificationIntervalMs,
        matchedMarketPosition: postCloseMatchedMarketPosition,
        matchedPositionSide: postCloseMatchedPositionSide,
        matchedPositionSizeUsd: postCloseMatchedPositionSizeUsd,
        closeOrderLifecycleStatus: closeOrderLifecycle.status,
        closeOrderLifecycleOrderKey: closeOrderLifecycle.orderKey,
        closeOrderLifecycleTxHash: closeOrderLifecycle.txHash,
      });
    }
  }

  const nextTransactionHistory = (() => {
    const txHash = executionResult.lastTxHash;
    const status = (() => {
      if (!executionResult.ok) {
        return 'failed' as const;
      }
      if (!willExecute) {
        return 'success' as const;
      }
      if (closeConfirmedOnchain) {
        return 'success' as const;
      }
      return 'failed' as const;
    })();
    const reason = (() => {
      if (!executionResult.ok) {
        return executionResult.error;
      }
      if (!willExecute) {
        return 'Planned GMX close transactions during fire (plan mode; not executed).';
      }
      if (closeOrderLifecycle.status === 'cancelled') {
        return closeOrderLifecycle.cancelReason
          ? `Submitted GMX close request during fire, but the close order was cancelled onchain: ${closeOrderLifecycle.cancelReason}`
          : 'Submitted GMX close request during fire, but the close order was cancelled onchain.';
      }
      if (closeConfirmationError) {
        return `Submitted GMX close request during fire, but close confirmation failed: ${closeConfirmationError}`;
      }
      if (closeConfirmedOnchain) {
        return 'Confirmed GMX position close during fire.';
      }
      return `Submitted GMX close request during fire, but position remained open after ${verificationAttemptsCompleted} verification checks.`;
    })();
    return [
      ...state.view.transactionHistory,
      {
        cycle: state.view.metrics.iteration,
        action: 'close',
        txHash,
        status,
        reason,
        timestamp: new Date().toISOString(),
      },
    ];
  })();

  type FireTerminalState = Parameters<typeof buildTaskStatus>[1];
  const terminalStatus: { state: FireTerminalState; message: string } = (() => {
    if (!executionResult.ok) {
      return {
        state: 'failed',
        message: `Agent fired, but closing GMX position failed: ${executionResult.error ?? 'Unknown error'}`,
      };
    }
    if (!willExecute) {
      return {
        state: 'completed',
        message: 'Agent fired in plan mode. Close transactions prepared (not executed).',
      };
    }
    if (closeOrderLifecycle.status === 'cancelled') {
      return {
        state: 'failed',
        message: closeOrderLifecycle.cancelReason
          ? `Agent fired, but GMX close order was cancelled onchain: ${closeOrderLifecycle.cancelReason}`
          : 'Agent fired, but GMX close order was cancelled onchain.',
      };
    }
    if (closeConfirmationError) {
      return {
        state: 'failed',
        message: `Agent fired, but close confirmation failed after submission: ${closeConfirmationError}`,
      };
    }
    if (closeConfirmedOnchain) {
      return {
        state: 'completed',
        message: 'Agent fired. GMX position close confirmed.',
      };
    }
    return {
      state: 'failed',
      message: `Agent fired, but position remains open after ${verificationAttemptsCompleted} verification checks.`,
    };
  })();
  const terminalState = terminalStatus.state;
  const terminalMessage = terminalStatus.message;

  const { task, statusEvent } = buildTaskStatus(currentTask, terminalState, terminalMessage);
  logFireDebug('fireCommand: execution finished', {
    threadId,
    ok: executionResult.ok,
    closeConfirmedOnchain,
    closeConfirmationError,
    postCloseMatchedMarketPosition,
    postCloseMatchedPositionSide,
    postCloseMatchedPositionSizeUsd,
    terminalState,
    txHash: executionResult.lastTxHash,
    message: terminalMessage,
  });
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
