import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import type { TaskState } from 'agent-workflow-core';

import { fetchAlloraInference, type AlloraInference } from '../../clients/allora.js';
import type {
  PerpetualLifecycleResponse,
  PerpetualPosition,
  TransactionPlan,
} from '../../clients/onchainActions.js';
import {
  ALLORA_HORIZON_HOURS,
  ALLORA_TOPIC_IDS,
  ALLORA_TOPIC_LABELS,
  ARBITRUM_CHAIN_ID,
  ONCHAIN_ACTIONS_API_URL,
  resolveAlloraApiBaseUrl,
  resolveAlloraApiKey,
  resolveAlloraChainId,
  resolveAllora8hInferenceCacheTtlMs,
  resolveGmxAlloraTxExecutionMode,
  resolvePollIntervalMs,
} from '../../config/constants.js';
import { buildAlloraPrediction } from '../../core/alloraPrediction.js';
import { buildCycleTelemetry } from '../../core/cycle.js';
import { buildPerpetualExecutionPlan } from '../../core/executionPlan.js';
import { applyExposureLimits } from '../../core/exposure.js';
import { selectGmxPerpetualMarket } from '../../core/marketSelection.js';
import type { AlloraPrediction } from '../../domain/types.js';
import {
  buildExecutionPlanArtifact,
  buildExecutionResultArtifact,
  buildTelemetryArtifact,
} from '../artifacts.js';
import { getOnchainActionsClient, getOnchainClients } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  logPauseSnapshot,
  logWarn,
  normalizeHexAddress,
  type ClmmEvent,
  type GmxLatestSnapshot,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';
import { executePerpetualPlan } from '../execution.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};

const DECISION_THRESHOLD = 0.62;
const CONNECT_DELAY_MS = 2500;
const CONNECT_DELAY_STEPS = 3;
const ALLORA_STALE_CYCLE_LIMIT = 3;
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';
const POSITION_SYNC_GUARD_WINDOW_MS = 90_000;
const GMX_PERPETUALS_PROVIDER_NAME = 'GMX Perpetuals' as const;

type PositionSyncGuard = NonNullable<ClmmState['view']['metrics']['pendingPositionSync']>;

function shouldDelayIteration(iteration: number): boolean {
  return iteration % 3 === 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTopicKey(symbol: string): 'BTC' | 'ETH' {
  return symbol === 'BTC' ? 'BTC' : 'ETH';
}

function buildInferenceSnapshotKey(inference: AlloraInference): string {
  return JSON.stringify({
    topicId: inference.topicId,
    combinedValue: inference.combinedValue,
    confidenceIntervalValues: inference.confidenceIntervalValues,
  });
}

function isTradePlanAction(action: 'none' | 'long' | 'short' | 'close' | 'reduce'): boolean {
  return action !== 'none';
}

function parseUsdMetric(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (/^-?\d+\.\d+$/u.test(normalized)) {
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
  }
  if (!/^-?\d+$/u.test(normalized)) {
    return undefined;
  }

  const sign = normalized.startsWith('-') ? -1 : 1;
  const digits = normalized.startsWith('-') ? normalized.slice(1) : normalized;
  if (digits.length > 18) {
    const scale = 10n ** 30n;
    const bigint = BigInt(normalized);
    const abs = bigint < 0n ? -bigint : bigint;
    const integerPart = abs / scale;
    const fractionPart = abs % scale;
    return sign * (Number(integerPart) + Number(fractionPart) / Number(scale));
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function parseBaseUnitAmount(raw: string | undefined, decimals: number): number | undefined {
  if (!raw) {
    return undefined;
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    return undefined;
  }
  const normalized = raw.trim();
  if (!/^-?\d+$/u.test(normalized)) {
    return undefined;
  }

  const base = 10n ** BigInt(decimals);
  const value = BigInt(normalized);
  const sign = value < 0n ? -1 : 1;
  const abs = value < 0n ? -value : value;
  const integerPart = abs / base;
  const fractionalPart = abs % base;
  return sign * (Number(integerPart) + Number(fractionalPart) / Number(base));
}

function parseEpochToIso(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/u.test(trimmed)) {
    return undefined;
  }
  const asNumber = Number(trimmed);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return undefined;
  }
  const millis = asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getCallSelector(data: string): string | undefined {
  if (!data.startsWith('0x') || data.length < 10) {
    return undefined;
  }
  return data.slice(0, 10).toLowerCase();
}

function isApprovalOnlyTransactions(transactions: TransactionPlan[] | undefined): boolean {
  if (!transactions || transactions.length === 0) {
    return false;
  }
  return transactions.every((tx) => getCallSelector(tx.data) === ERC20_APPROVE_SELECTOR);
}

function resolveActivePositionSyncGuard(
  guard: ClmmState['view']['metrics']['pendingPositionSync'],
  nowEpochMs: number,
): PositionSyncGuard | undefined {
  if (!guard) {
    return undefined;
  }
  if (guard.expiresAtEpochMs <= nowEpochMs) {
    return undefined;
  }
  return guard;
}

type ExecutionFailureSummary = {
  taskState: TaskState;
  statusMessage: string;
  detail: string;
  requiresFundingAcknowledgement: boolean;
};

function summarizeExecutionFailure(params: {
  iteration: number;
  error?: string;
}): ExecutionFailureSummary {
  const rawError = params.error ?? 'Unknown error';
  const normalized = rawError.toLowerCase();
  const isSimulationFailure = normalized.includes('execute order simulation failed');
  const isLikelyFundingIssue =
    normalized.includes('insufficient') || normalized.includes('execution fee');

  if (isSimulationFailure || isLikelyFundingIssue) {
    const detail =
      'GMX order simulation failed. Ensure the trading wallet has enough USDC collateral and a small amount of Arbitrum ETH for execution fees. After funding, click Continue in Agent Blockers to retry immediately.';
    return {
      taskState: 'input-required',
      statusMessage: `[Cycle ${params.iteration}] trade paused: ${detail}`,
      detail,
      requiresFundingAcknowledgement: true,
    };
  }

  return {
    taskState: 'working',
    statusMessage: `[Cycle ${params.iteration}] execution failed: ${rawError}`,
    detail: rawError,
    requiresFundingAcknowledgement: false,
  };
}

function isResolvedLifecycle(
  lifecycle: PerpetualLifecycleResponse,
): lifecycle is Extract<PerpetualLifecycleResponse, { orderKey: string }> {
  return lifecycle.needsDisambiguation !== true;
}

function formatLifecycleFailureDetail(params: {
  status: 'cancelled' | 'failed';
  reason?: string;
}): string {
  if (params.reason) {
    return `Onchain order ${params.status}: ${params.reason}`;
  }
  return `Onchain order ${params.status}.`;
}

function buildLatestSnapshot(params: {
  marketAddress: `0x${string}`;
  timestamp: string;
  position?: PerpetualPosition;
  fallbackSizeUsd?: number;
  fallbackLeverage?: number;
  fallbackOpenedAt?: string;
  previous?: GmxLatestSnapshot;
}): GmxLatestSnapshot {
  const positionSize = params.position ? parseUsdMetric(params.position.sizeInUsd) : undefined;
  const totalUsd = positionSize ?? params.fallbackSizeUsd;
  const collateralUsd = params.position
    ? parseBaseUnitAmount(params.position.collateralAmount, params.position.collateralToken.decimals)
    : undefined;
  const derivedLeverage =
    positionSize !== undefined && collateralUsd !== undefined && collateralUsd > 0
      ? positionSize / collateralUsd
      : undefined;
  const leverage = derivedLeverage ?? params.fallbackLeverage ?? params.previous?.leverage;

  const openedAt = params.position
    ? parseEpochToIso(params.position.increasedAtTime)
    : params.fallbackOpenedAt ?? params.previous?.positionOpenedAt;

  if (!params.position && totalUsd === undefined && params.previous) {
    return {
      ...params.previous,
      timestamp: params.timestamp,
    };
  }

  if (params.position) {
    const collateralAddress = normalizeHexAddress(
      params.position.collateralToken.tokenUid.address,
      'collateral token address',
    );
    return {
      poolAddress: normalizeHexAddress(params.position.marketAddress, 'market address'),
      totalUsd,
      leverage,
      timestamp: params.timestamp,
      positionOpenedAt: openedAt,
      positionTokens: [
        {
          address: collateralAddress,
          symbol: params.position.collateralToken.symbol,
          decimals: params.position.collateralToken.decimals,
          amountBaseUnits: params.position.collateralAmount,
          valueUsd: collateralUsd,
        },
      ],
    };
  }

  return {
    poolAddress: params.marketAddress,
    totalUsd,
    leverage,
    timestamp: params.timestamp,
    positionOpenedAt: openedAt,
    positionTokens: [],
  };
}

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const runtimeConfig = (config as Configurable).configurable;
  const runtimeThreadId = runtimeConfig?.thread_id;
  const runtimeCheckpointId = runtimeConfig?.checkpoint_id;
  const runtimeCheckpointNamespace = runtimeConfig?.checkpoint_ns;
  const { operatorConfig, selectedPool } = state.view;

  if (!operatorConfig || !selectedPool) {
    const nextOnboardingNode = resolveNextOnboardingNode(state);
    if (nextOnboardingNode !== 'syncState') {
      const needsUserInput =
        nextOnboardingNode === 'collectSetupInput' ||
        nextOnboardingNode === 'collectFundingTokenInput' ||
        nextOnboardingNode === 'collectDelegations';
      const status = needsUserInput ? 'input-required' : 'working';
      const message = needsUserInput
        ? 'Cycle paused until onboarding input is complete.'
        : 'Cycle paused while onboarding prerequisites are prepared.';
      const { task, statusEvent } = buildTaskStatus(state.view.task, status, message);
      const mergedView = {
        ...state.view,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      };
      logInfo('pollCycle: onboarding incomplete; rerouting before polling', {
        nextOnboardingNode,
        hasOperatorConfig: Boolean(state.view.operatorConfig),
        hasSelectedPool: Boolean(state.view.selectedPool),
      });
      await copilotkitEmitState(config, {
        view: mergedView,
      });
      if (needsUserInput) {
        logPauseSnapshot({
          node: 'pollCycle',
          reason: 'onboarding prerequisites incomplete',
          view: mergedView,
          metadata: {
            pauseMechanism: 'state-wait',
            nextOnboardingNode,
          },
        });
      }
      return {
        view: mergedView,
      };
    }

    const failureMessage = 'ERROR: Polling node missing GMX strategy configuration';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        metrics: state.view.metrics,
        task,
        profile: state.view.profile,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }

  logInfo('pollCycle: executing cycle with configured strategy', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    hasOperatorConfig: Boolean(operatorConfig),
    hasSelectedPool: Boolean(selectedPool),
    onboardingStatus: state.view.onboardingFlow?.status,
    currentTaskState: state.view.task?.taskStatus?.state,
    currentTaskMessage: state.view.task?.taskStatus?.message?.content,
  });

  const iteration = (state.view.metrics.iteration ?? 0) + 1;
  const topicKey = resolveTopicKey(selectedPool.baseSymbol);
  const topicId = ALLORA_TOPIC_IDS[topicKey];
  const topicLabel = ALLORA_TOPIC_LABELS[topicKey];

  let prediction: AlloraPrediction;
  let inferenceSnapshotKey = state.view.metrics.lastInferenceSnapshotKey;
  let staleCycles = state.view.metrics.staleCycles ?? 0;
  try {
    const inference = await fetchAlloraInference({
      baseUrl: resolveAlloraApiBaseUrl(),
      chainId: resolveAlloraChainId(),
      topicId,
      apiKey: resolveAlloraApiKey(),
      cacheTtlMs: resolveAllora8hInferenceCacheTtlMs(),
    });
    inferenceSnapshotKey = buildInferenceSnapshotKey(inference);
    staleCycles = 0;
    const currentPrice = state.view.metrics.previousPrice ?? inference.combinedValue;
    prediction = buildAlloraPrediction({
      inference,
      currentPrice,
      topic: topicLabel,
      horizonHours: ALLORA_HORIZON_HOURS,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    staleCycles += 1;

    // Auth errors are configuration errors; surface them immediately.
    if (message.includes('(401)') || message.includes('(403)')) {
      const failureMessage = `ERROR: Failed to fetch Allora prediction: ${message}`;
      const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        view: {
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        },
      });
      return {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: { ...state.view.metrics, staleCycles, iteration },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
        },
      };
    }

    // Transient failures should not brick the agent; skip trades and retry on the next cycle.
    if (staleCycles > ALLORA_STALE_CYCLE_LIMIT) {
      const failureMessage = `ERROR: Abort: Allora API unreachable for ${staleCycles} consecutive cycles (last error: ${message})`;
      const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        view: {
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        },
      });
      return {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: { ...state.view.metrics, staleCycles, iteration },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
        },
      };
    }

    const warningMessage = `WARNING: Allora prediction unavailable (attempt ${staleCycles}/${ALLORA_STALE_CYCLE_LIMIT}); skipping trades this cycle.`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'working', warningMessage);
    await copilotkitEmitState(config, {
      view: {
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    });
    return {
      view: {
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        metrics: { ...state.view.metrics, staleCycles, iteration },
        task,
        profile: state.view.profile,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }

  let gmxMarketAddress: string;
  let positions: PerpetualPosition[] = [];
  const onchainActionsClient = getOnchainActionsClient();
  try {
    const chainIds = [ARBITRUM_CHAIN_ID.toString()];
    const [markets, walletPositions] = await Promise.all([
      onchainActionsClient.listPerpetualMarkets({ chainIds }),
      onchainActionsClient.listPerpetualPositions({
        walletAddress: operatorConfig.delegatorWalletAddress,
        chainIds,
      }),
    ]);

    const selectedMarket = selectGmxPerpetualMarket({
      markets,
      baseSymbol: selectedPool.baseSymbol,
      quoteSymbol: selectedPool.quoteSymbol,
    });

    if (!selectedMarket) {
      const failureMessage = `ERROR: No GMX ${selectedPool.baseSymbol}/${selectedPool.quoteSymbol} market available`;
      const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        view: {
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        },
      });
      return {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: state.view.metrics,
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
        },
      };
    }

    gmxMarketAddress = selectedMarket.marketToken.address;
    positions = walletPositions;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to fetch GMX markets/positions from ${ONCHAIN_ACTIONS_API_URL}: ${message}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        metrics: state.view.metrics,
        task,
        profile: state.view.profile,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }

  const previousCycle = state.view.metrics.latestCycle;
  const assumedPositionSide = state.view.metrics.assumedPositionSide;
  const nowEpochMs = Date.now();
  const activePositionSyncGuard = resolveActivePositionSyncGuard(
    state.view.metrics.pendingPositionSync,
    nowEpochMs,
  );
  const normalizedTargetMarket = gmxMarketAddress.toLowerCase();
  const currentMarketPosition = positions.find(
    (position) => position.marketAddress.toLowerCase() === normalizedTargetMarket,
  );
  logWarn('pollCycle: market position snapshot before decision', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    iteration,
    targetMarketAddress: normalizedTargetMarket,
    totalPositions: positions.length,
    matchedMarketPosition: Boolean(currentMarketPosition),
    matchedPositionSide: currentMarketPosition?.positionSide,
    matchedPositionSizeUsd: currentMarketPosition?.sizeInUsd,
    matchedPositionPnl: currentMarketPosition?.pnl,
    assumedPositionSide,
    activePositionSyncGuardExpectedSide: activePositionSyncGuard?.expectedSide,
    activePositionSyncGuardSourceAction: activePositionSyncGuard?.sourceAction,
    activePositionSyncGuardExpiresAtEpochMs: activePositionSyncGuard?.expiresAtEpochMs,
  });
  const currentPositionSide = currentMarketPosition?.positionSide;
  // Only treat a prior position as open when it is backed by onchain state
  // (current position) or explicit local assumption from a successful prior trade.
  // Never infer open state from previous cycle telemetry alone.
  const decisionPreviousSide =
    currentPositionSide ?? assumedPositionSide ?? activePositionSyncGuard?.expectedSide;
  const decisionPreviousAction = decisionPreviousSide ? 'open' : undefined;
  logWarn('pollCycle: decision context resolved', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    iteration,
    currentPositionSide,
    assumedPositionSide,
    previousCycleAction: previousCycle?.action,
    previousCycleSide: previousCycle?.side,
    activePositionSyncGuardExpectedSide: activePositionSyncGuard?.expectedSide,
    activePositionSyncGuardSourceAction: activePositionSyncGuard?.sourceAction,
    decisionPreviousAction,
    decisionPreviousSide,
  });
  const { telemetry, nextCyclesSinceTrade: initialCyclesSinceTrade } = buildCycleTelemetry({
    prediction,
    decisionThreshold: DECISION_THRESHOLD,
    cooldownCycles: 0,
    maxLeverage: operatorConfig.maxLeverage,
    baseContributionUsd: operatorConfig.baseContributionUsd,
    previousAction: decisionPreviousAction,
    previousSide: decisionPreviousSide,
    cyclesSinceTrade: state.view.metrics.cyclesSinceRebalance ?? 0,
    isFirstCycle: iteration === 1,
    iteration,
    marketSymbol: `${selectedPool.baseSymbol}/${selectedPool.quoteSymbol}`,
  });

  const exposureAdjusted = applyExposureLimits({
    telemetry,
    positions,
    targetMarketAddress: gmxMarketAddress,
    maxMarketExposureUsd: operatorConfig.baseContributionUsd * operatorConfig.maxLeverage,
    maxTotalExposureUsd: operatorConfig.baseContributionUsd * operatorConfig.maxLeverage,
  });

  const positionForReduce =
    exposureAdjusted.action === 'reduce' && exposureAdjusted.side
      ? positions.find(
          (position) =>
            position.marketAddress.toLowerCase() === normalizedTargetMarket &&
            position.positionSide === exposureAdjusted.side,
        )
      : undefined;

  const plannedExecutionPlan = buildPerpetualExecutionPlan({
    telemetry: exposureAdjusted,
    chainId: ARBITRUM_CHAIN_ID.toString(),
    marketAddress: gmxMarketAddress as `0x${string}`,
    walletAddress: operatorConfig.delegatorWalletAddress,
    payTokenAddress: operatorConfig.fundingTokenAddress,
    collateralTokenAddress: operatorConfig.fundingTokenAddress,
    positionContractKey: positionForReduce?.contractKey,
    positionSizeInUsd: positionForReduce?.sizeInUsd,
  });

  const skipTradeForUnchangedInference =
    isTradePlanAction(plannedExecutionPlan.action) &&
    Boolean(inferenceSnapshotKey) &&
    state.view.metrics.lastTradedInferenceSnapshotKey === inferenceSnapshotKey;

  let adjustedTelemetry = skipTradeForUnchangedInference
    ? {
        ...exposureAdjusted,
        action: 'hold' as const,
        reason: 'Inference metrics unchanged since last trade; skipping additional action.',
        side: undefined,
        leverage: undefined,
        sizeUsd: undefined,
        txHash: undefined,
      }
    : exposureAdjusted;

  let executionPlan = skipTradeForUnchangedInference
    ? ({ action: 'none' } as const)
    : plannedExecutionPlan;
  const shouldDeferTradeForPositionSync =
    Boolean(activePositionSyncGuard) &&
    !currentMarketPosition &&
    executionPlan.action !== 'none';
  if (shouldDeferTradeForPositionSync) {
    const sourceTxHash = activePositionSyncGuard?.sourceTxHash;
    const sourceAction = activePositionSyncGuard?.sourceAction;
    adjustedTelemetry = {
      ...adjustedTelemetry,
      action: 'hold',
      side: undefined,
      leverage: undefined,
      sizeUsd: undefined,
      txHash: undefined,
      reason: sourceTxHash
        ? `Awaiting GMX position index sync after ${sourceAction} tx ${sourceTxHash.slice(0, 10)}... before next trade decision.`
        : `Awaiting GMX position index sync after ${sourceAction} action before next trade decision.`,
    };
    executionPlan = { action: 'none' } as const;
  }
  logWarn('pollCycle: decision and execution plan resolved', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    iteration,
    adjustedAction: adjustedTelemetry.action,
    adjustedReason: adjustedTelemetry.reason,
    decisionSide: adjustedTelemetry.side,
    decisionSizeUsd: adjustedTelemetry.sizeUsd,
    executionPlanAction: executionPlan.action,
    skipTradeForUnchangedInference,
    deferredForPositionSync: shouldDeferTradeForPositionSync,
    activePositionSyncGuardExpectedSide: activePositionSyncGuard?.expectedSide,
    activePositionSyncGuardSourceAction: activePositionSyncGuard?.sourceAction,
    inferenceSnapshotKey,
    lastTradedInferenceSnapshotKey: state.view.metrics.lastTradedInferenceSnapshotKey,
    txExecutionMode: resolveGmxAlloraTxExecutionMode(),
  });

  const nextCyclesSinceTrade =
    adjustedTelemetry.action === 'hold' && telemetry.action === 'open'
      ? (state.view.metrics.cyclesSinceRebalance ?? 0) + 1
      : initialCyclesSinceTrade;

  const action = adjustedTelemetry.action;
  const reason = adjustedTelemetry.reason;
  const txHash = adjustedTelemetry.txHash;

  const cycleStatusMessage = `[Cycle ${iteration}] ${action}: ${reason}${txHash ? ` (tx: ${txHash.slice(0, 10)}...)` : ''}`;
  let { task, statusEvent } = buildTaskStatus(state.view.task, 'working', cycleStatusMessage);
  await copilotkitEmitState(config, {
    view: {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      metrics: { latestCycle: adjustedTelemetry },
    },
  });

  if (shouldDelayIteration(iteration)) {
    const stepDelayMs = Math.max(1, Math.floor(CONNECT_DELAY_MS / CONNECT_DELAY_STEPS));
    for (let step = 1; step <= CONNECT_DELAY_STEPS; step += 1) {
      const waitMessage = `[Cycle ${iteration}] streaming... (${step}/${CONNECT_DELAY_STEPS})`;
      const updated = buildTaskStatus(task, 'working', waitMessage);
      task = updated.task;
      statusEvent = updated.statusEvent;
      await copilotkitEmitState(config, {
        view: {
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: { latestCycle: adjustedTelemetry },
        },
      });
      await delay(stepDelayMs);
    }
  }

  const txExecutionMode = resolveGmxAlloraTxExecutionMode();
  const clients = txExecutionMode === 'execute' ? getOnchainClients() : undefined;
  if (executionPlan.action === 'none') {
    logWarn('pollCycle: execution plan is none; no order simulation/execution will be attempted', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      adjustedAction: adjustedTelemetry.action,
      adjustedReason: adjustedTelemetry.reason,
      txExecutionMode,
    });
  } else {
    logWarn('pollCycle: invoking executePerpetualPlan', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      executionPlanAction: executionPlan.action,
      txExecutionMode,
      delegationsBypassActive: state.view.delegationsBypassActive === true,
      hasDelegationBundle: Boolean(state.view.delegationBundle),
      delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
      delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
    });
  }
  const executionResult = await executePerpetualPlan({
    client: onchainActionsClient,
    clients,
    plan: executionPlan,
    txExecutionMode,
    delegationsBypassActive: state.view.delegationsBypassActive === true,
    delegationBundle: state.view.delegationBundle,
    delegatorWalletAddress: operatorConfig.delegatorWalletAddress,
    delegateeWalletAddress: operatorConfig.delegateeWalletAddress,
  });
  logWarn('pollCycle: executePerpetualPlan resolved', {
    threadId: runtimeThreadId,
    checkpointId: runtimeCheckpointId,
    checkpointNamespace: runtimeCheckpointNamespace,
    iteration,
    action: executionResult.action,
    ok: executionResult.ok,
    txHash: executionResult.lastTxHash,
    txHashes: executionResult.txHashes,
    error: executionResult.ok ? undefined : executionResult.error,
  });
  const approvalOnlyExecution =
    executionResult.ok &&
    (executionPlan.action === 'long' || executionPlan.action === 'short') &&
    isApprovalOnlyTransactions(executionResult.transactions);
  let lifecycleFailure: ExecutionFailureSummary | undefined;
  if (
    executionResult.ok &&
    txExecutionMode === 'execute' &&
    executionPlan.action !== 'none' &&
    !approvalOnlyExecution &&
    executionResult.lastTxHash
  ) {
    try {
      const lifecycle = await onchainActionsClient.getPerpetualLifecycle({
        providerName: GMX_PERPETUALS_PROVIDER_NAME,
        chainId: ARBITRUM_CHAIN_ID.toString(),
        txHash: executionResult.lastTxHash,
        walletAddress: operatorConfig.delegatorWalletAddress,
      });

      if (isResolvedLifecycle(lifecycle)) {
        logWarn('pollCycle: perpetual lifecycle status resolved', {
          threadId: runtimeThreadId,
          checkpointId: runtimeCheckpointId,
          checkpointNamespace: runtimeCheckpointNamespace,
          iteration,
          lifecycleStatus: lifecycle.status,
          lifecycleOrderKey: lifecycle.orderKey,
          lifecycleTxHash:
            lifecycle.executionTxHash ??
            lifecycle.cancellationTxHash ??
            lifecycle.createTxHash ??
            lifecycle.txHash,
          lifecycleReason: lifecycle.reason,
        });
        if (lifecycle.status === 'cancelled' || lifecycle.status === 'failed') {
          lifecycleFailure = summarizeExecutionFailure({
            iteration,
            error: formatLifecycleFailureDetail({
              status: lifecycle.status,
              reason: lifecycle.reason,
            }),
          });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logWarn('pollCycle: perpetual lifecycle status query failed', {
        threadId: runtimeThreadId,
        checkpointId: runtimeCheckpointId,
        checkpointNamespace: runtimeCheckpointNamespace,
        iteration,
        txHash: executionResult.lastTxHash,
        error: message,
      });
      lifecycleFailure = summarizeExecutionFailure({
        iteration,
        error: `Unable to verify onchain order lifecycle status: ${message}`,
      });
    }
  }

  const executionFailure =
    lifecycleFailure ??
    (executionResult.ok
      ? undefined
      : summarizeExecutionFailure({
          iteration,
          error: executionResult.error,
        }));
  const executionCompletedSuccessfully = executionResult.ok && !executionFailure;

  if (executionFailure) {
    const failedStatus = buildTaskStatus(
      task,
      executionFailure.taskState,
      executionFailure.statusMessage,
    );
    task = failedStatus.task;
    statusEvent = failedStatus.statusEvent;
  } else if (approvalOnlyExecution) {
    const approvalStatus = buildTaskStatus(
      task,
      'working',
      `[Cycle ${iteration}] approval completed; waiting for executable GMX trade transaction.`,
    );
    task = approvalStatus.task;
    statusEvent = approvalStatus.statusEvent;
  }

  const latestCycle =
    approvalOnlyExecution
      ? {
          ...adjustedTelemetry,
          action: 'hold' as const,
          side: undefined,
          leverage: undefined,
          sizeUsd: undefined,
          txHash: undefined,
          reason: `${adjustedTelemetry.reason} Approval completed; waiting for executable GMX trade transaction.`,
        }
      : adjustedTelemetry;

  let positionAfterExecution = currentMarketPosition;
  if (executionCompletedSuccessfully && executionPlan.action !== 'none') {
    try {
      const refreshedPositions = await onchainActionsClient.listPerpetualPositions({
        walletAddress: operatorConfig.delegatorWalletAddress,
        chainIds: [ARBITRUM_CHAIN_ID.toString()],
      });
      positionAfterExecution = refreshedPositions.find(
        (position) => position.marketAddress.toLowerCase() === normalizedTargetMarket,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logInfo('Unable to refresh GMX position snapshot after execution', { error: message });
    }
  }

  const fallbackSizeUsd =
    approvalOnlyExecution
      ? undefined
      : executionCompletedSuccessfully && executionPlan.action === 'close'
      ? 0
      : executionCompletedSuccessfully &&
          (executionPlan.action === 'long' || executionPlan.action === 'short')
        ? adjustedTelemetry.sizeUsd
        : undefined;
  const normalizedFallbackSizeUsd =
    fallbackSizeUsd ??
    // Positions fetch already succeeded for this cycle. If target-market position is absent,
    // clear stale snapshot exposure instead of carrying forward previous non-zero totals.
    (positionAfterExecution ? undefined : 0);

  const latestSnapshot = buildLatestSnapshot({
    marketAddress: normalizeHexAddress(gmxMarketAddress, 'market address'),
    timestamp: latestCycle.timestamp,
    position: positionAfterExecution,
    fallbackSizeUsd: normalizedFallbackSizeUsd,
    fallbackLeverage:
      executionResult.ok && (executionPlan.action === 'long' || executionPlan.action === 'short')
        ? latestCycle.leverage
        : undefined,
    fallbackOpenedAt:
      executionResult.ok && (executionPlan.action === 'long' || executionPlan.action === 'short')
        ? latestCycle.timestamp
        : undefined,
    previous: state.view.metrics.latestSnapshot,
  });

  const hasCompletedTradeEffect =
    executionCompletedSuccessfully && executionPlan.action !== 'none' && !approvalOnlyExecution;
  const lifetimePnlUsd = positionAfterExecution
    ? parseUsdMetric(positionAfterExecution.pnl)
    : executionCompletedSuccessfully && executionPlan.action === 'close'
      ? 0
      : state.view.metrics.lifetimePnlUsd;

  const nextPendingPositionSync: PositionSyncGuard | undefined = (():
    | PositionSyncGuard
    | undefined => {
    const activeGuardWithoutPosition = activePositionSyncGuard && !positionAfterExecution;
    if (!executionCompletedSuccessfully || executionPlan.action === 'none' || approvalOnlyExecution) {
      return activeGuardWithoutPosition ? activePositionSyncGuard : undefined;
    }
    if (executionPlan.action === 'close') {
      if (!positionAfterExecution) {
        return undefined;
      }
      return {
        expectedSide: undefined,
        sourceAction: 'close' as const,
        sourceIteration: iteration,
        sourceTxHash: executionResult.lastTxHash,
        expiresAtEpochMs: nowEpochMs + POSITION_SYNC_GUARD_WINDOW_MS,
      };
    }

    if (executionPlan.action === 'long' || executionPlan.action === 'short') {
      const expectedSide = executionPlan.action;
      if (positionAfterExecution?.positionSide === expectedSide) {
        return undefined;
      }
      return {
        expectedSide,
        sourceAction: executionPlan.action,
        sourceIteration: iteration,
        sourceTxHash: executionResult.lastTxHash,
        expiresAtEpochMs: nowEpochMs + POSITION_SYNC_GUARD_WINDOW_MS,
      };
    }
    return activeGuardWithoutPosition ? activePositionSyncGuard : undefined;
  })();
  if (nextPendingPositionSync) {
    logWarn('pollCycle: position sync guard active', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      expectedSide: nextPendingPositionSync.expectedSide,
      sourceAction: nextPendingPositionSync.sourceAction,
      sourceIteration: nextPendingPositionSync.sourceIteration,
      sourceTxHash: nextPendingPositionSync.sourceTxHash,
      expiresAtEpochMs: nextPendingPositionSync.expiresAtEpochMs,
      matchedMarketPositionAfterExecution: Boolean(positionAfterExecution),
      matchedPositionSideAfterExecution: positionAfterExecution?.positionSide,
    });
  }

  const nextAssumedPositionSide = (() => {
    if (!executionCompletedSuccessfully) {
      return currentPositionSide ?? assumedPositionSide ?? activePositionSyncGuard?.expectedSide;
    }
    if (approvalOnlyExecution) {
      return assumedPositionSide;
    }
    // Planned actions should advance local assumptions immediately so we don't
    // repeat stale intent on the next cycle.
    if (executionPlan.action === 'close') {
      return undefined;
    }
    if (executionPlan.action === 'long') {
      return 'long';
    }
    if (executionPlan.action === 'short') {
      return 'short';
    }
    // Otherwise, prefer actual onchain state when available.
    if (positionAfterExecution?.positionSide) {
      return positionAfterExecution.positionSide;
    }
    return currentPositionSide ?? assumedPositionSide ?? nextPendingPositionSync?.expectedSide;
  })();
  const executionPlanEvent: ClmmEvent | undefined =
    executionPlan.action === 'none'
      ? undefined
      : {
          type: 'artifact',
          artifact: buildExecutionPlanArtifact({ plan: executionPlan, telemetry: latestCycle }),
          append: true,
        };
  const requiresFundingAcknowledgement = executionFailure?.requiresFundingAcknowledgement === true;
  if (requiresFundingAcknowledgement) {
    logWarn('pollCycle: execution blocked; funding acknowledgement required', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
      iteration,
      detail: executionFailure?.detail,
      rawError: executionResult.error,
      taskState: executionFailure?.taskState,
      plannedAction: executionPlan.action,
      decisionAction: latestCycle.action,
      decisionReason: latestCycle.reason,
      targetMarketAddress: normalizedTargetMarket,
      matchedMarketPosition: Boolean(currentMarketPosition),
      matchedMarketPositionSide: currentMarketPosition?.positionSide,
      matchedMarketPositionSizeUsd: currentMarketPosition?.sizeInUsd,
      assumedPositionSide,
      activePositionSyncGuardExpectedSide: activePositionSyncGuard?.expectedSide,
    });
  }
  const executionResultEvent: ClmmEvent | undefined =
    executionPlan.action === 'none'
      ? undefined
      : {
          type: 'artifact',
          artifact: buildExecutionResultArtifact({
            action: executionResult.action,
            plan: executionPlan,
            ok: executionResult.ok,
            status: requiresFundingAcknowledgement
              ? 'blocked'
              : executionCompletedSuccessfully
                ? 'confirmed'
                : 'failed',
            error: requiresFundingAcknowledgement
              ? undefined
              : executionFailure?.detail ?? executionResult.error,
            telemetry: latestCycle,
            transactions: executionResult.transactions,
            txHashes: executionResult.txHashes,
            lastTxHash: executionResult.lastTxHash,
          }),
        append: true,
      };
  const telemetryEvent: ClmmEvent = {
    type: 'artifact',
    artifact: buildTelemetryArtifact(latestCycle),
    append: true,
  };

  let cronScheduled = state.private.cronScheduled;
  if (runtimeThreadId && !cronScheduled) {
    const intervalMs = state.private.pollIntervalMs ?? resolvePollIntervalMs();
    ensureCronForThread(runtimeThreadId, intervalMs);
    logInfo('Cron scheduled after first GMX cycle', {
      threadId: runtimeThreadId,
      checkpointId: runtimeCheckpointId,
      checkpointNamespace: runtimeCheckpointNamespace,
    });
    cronScheduled = true;
  }

  const finalAction = latestCycle.action;
  const finalReason = latestCycle.reason;
  const resolvedTxHash = executionResult.lastTxHash ?? latestCycle.txHash;
  const transactionEntry =
    executionPlan.action !== 'none' && !requiresFundingAcknowledgement
      ? {
          cycle: iteration,
          action: finalAction,
          txHash: resolvedTxHash,
          status: executionCompletedSuccessfully ? ('success' as const) : ('failed' as const),
          reason: executionCompletedSuccessfully
            ? finalReason
            : executionFailure?.detail ?? executionResult.error ?? finalReason,
          timestamp: latestCycle.timestamp,
        }
      : undefined;

  const baseAum = state.view.profile.aum ?? 52_000;
  const baseIncome = state.view.profile.agentIncome ?? 5_400;
  const aumDelta = finalAction === 'hold' || finalAction === 'cooldown' ? 10 : 180;
  const incomeDelta = finalAction === 'hold' || finalAction === 'cooldown' ? 1.2 : 9.5;
  const nextProfile = {
    ...state.view.profile,
    aum: Number((baseAum + aumDelta).toFixed(2)),
    agentIncome: Number((baseIncome + incomeDelta).toFixed(2)),
  };

  return {
    view: {
      metrics: {
        lastSnapshot: selectedPool,
        previousPrice: prediction.predictedPrice,
        cyclesSinceRebalance: approvalOnlyExecution
          ? (state.view.metrics.cyclesSinceRebalance ?? 0) + 1
          : nextCyclesSinceTrade,
        staleCycles: state.view.metrics.staleCycles ?? 0,
        iteration,
        latestCycle,
        aumUsd: latestSnapshot.totalUsd,
        apy: state.view.metrics.apy ?? state.view.profile.apy,
        lifetimePnlUsd,
        latestSnapshot,
        assumedPositionSide: nextAssumedPositionSide,
        lastInferenceSnapshotKey: inferenceSnapshotKey,
        lastTradedInferenceSnapshotKey:
          hasCompletedTradeEffect && inferenceSnapshotKey
            ? inferenceSnapshotKey
            : state.view.metrics.lastTradedInferenceSnapshotKey,
        pendingPositionSync: nextPendingPositionSync,
      },
      task,
      activity: {
        telemetry: [latestCycle],
        events: executionPlanEvent
          ? executionResultEvent
            ? [telemetryEvent, executionPlanEvent, executionResultEvent, statusEvent]
            : [telemetryEvent, executionPlanEvent, statusEvent]
          : [telemetryEvent, statusEvent],
      },
      transactionHistory: transactionEntry
        ? [...state.view.transactionHistory, transactionEntry]
        : state.view.transactionHistory,
      profile: nextProfile,
      selectedPool,
      haltReason: '',
      executionError: executionFailure?.requiresFundingAcknowledgement
        ? ''
        : executionFailure?.detail ?? '',
    },
    private: {
      cronScheduled,
    },
  };
};
