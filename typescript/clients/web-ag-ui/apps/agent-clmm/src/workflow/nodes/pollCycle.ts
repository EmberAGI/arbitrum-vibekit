import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command } from '@langchain/langgraph';
import { buildNodeTransition } from 'agent-workflow-core';

import { applyAccountingUpdate, createFlowEvent } from '../../accounting/state.js';
import type { AccountingState, FlowLogEventInput } from '../../accounting/types.js';
import { formatEmberApiError, fetchPoolSnapshot } from '../../clients/emberApi.js';
import {
  ARBITRUM_CHAIN_ID,
  DATA_STALE_CYCLE_LIMIT,
  MAX_GAS_SPEND_ETH,
  resolveEthUsdPrice,
  resolveMinAllocationPct,
  resolvePollIntervalMs,
  resolveRebalanceThresholdPct,
} from '../../config/constants.js';
import {
  buildRange,
  computeVolatilityPct,
  deriveMidPrice,
  evaluateDecision,
  estimateFeeValueUsd,
  normalizePosition,
  tickToPrice,
} from '../../core/decision-engine.js';
import { type CamelotPool, type ClmmAction, type RebalanceTelemetry } from '../../domain/types.js';
import {
  cloneSnapshotForTrigger,
  createCamelotAccountingSnapshot,
  resolveAccountingContextId,
} from '../accounting.js';
import { buildTelemetryArtifact } from '../artifacts.js';
import { getCamelotClient, getOnchainClients } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';
import { executeDecision } from '../execution.js';
import {
  appendFlowLogHistory,
  appendNavSnapshotHistory,
  appendTelemetryHistory,
  appendTransactionHistory,
  loadFlowLogHistory,
} from '../historyStore.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';
import { applyAccountingToView } from '../viewMapping.js';

const DEBUG_MODE = process.env['DEBUG_MODE'] === 'true';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = {
  configurable?: { thread_id?: string };
};

function buildAccountingLogSummary(params: {
  iteration: number;
  accounting: AccountingState;
  contextId: string | null;
  threadId?: string;
}): Record<string, unknown> {
  const latestSnapshot = params.accounting.latestNavSnapshot;
  return {
    iteration: params.iteration,
    threadId: params.threadId,
    contextId: params.contextId,
    latestSnapshot: latestSnapshot
      ? {
          cycle: latestSnapshot.cycle,
          trigger: latestSnapshot.trigger,
          timestamp: latestSnapshot.timestamp,
          totalUsd: latestSnapshot.totalUsd,
          positions: latestSnapshot.positions.length,
          feesUsd: latestSnapshot.feesUsd,
          rewardsUsd: latestSnapshot.rewardsUsd,
          priceSource: latestSnapshot.priceSource,
          transactionHash: latestSnapshot.transactionHash,
          isCurrentCycle: latestSnapshot.cycle === params.iteration,
        }
      : null,
    metrics: {
      aumUsd: params.accounting.aumUsd,
      positionsUsd: params.accounting.positionsUsd,
      cashUsd: params.accounting.cashUsd,
      lifetimePnlUsd: params.accounting.lifetimePnlUsd,
      lifetimeReturnPct: params.accounting.lifetimeReturnPct,
      highWaterMarkUsd: params.accounting.highWaterMarkUsd,
      apy: params.accounting.apy,
      initialAllocationUsd: params.accounting.initialAllocationUsd,
      lifecycleStart: params.accounting.lifecycleStart,
      lifecycleEnd: params.accounting.lifecycleEnd,
      lastUpdated: params.accounting.lastUpdated,
    },
    counts: {
      navSnapshots: params.accounting.navSnapshots.length,
      flowEvents: params.accounting.flowLog.length,
    },
  };
}

function logAccountingSummary(params: {
  iteration: number;
  accounting: AccountingState;
  contextId: string | null;
  threadId?: string;
  note?: string;
}): void {
  const summary = buildAccountingLogSummary(params);
  logInfo(
    'Accounting summary',
    params.note ? { ...summary, note: params.note } : summary,
    { detailed: true },
  );
}

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<Command<string, ClmmUpdate>> => {
  const { operatorConfig, selectedPool } = state.thread;

  if (!operatorConfig || !selectedPool) {
    const nextOnboardingNode = resolveNextOnboardingNode(state);
    if (nextOnboardingNode !== 'syncState') {
      logInfo('pollCycle: onboarding incomplete; rerouting before polling', {
        nextOnboardingNode,
        hasOperatorConfig: Boolean(state.thread.operatorConfig),
        hasSelectedPool: Boolean(state.thread.selectedPool),
      });
      return buildNodeTransition({
        node: nextOnboardingNode,
        createCommand: createLangGraphCommand,
      });
    }

    const failureMessage = 'ERROR: Polling node missing required state (operatorConfig or selectedPool)';
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry } },
    });
    return buildNodeTransition({
      node: 'summarize',
      update: {
        thread: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
          metrics: {
            iteration: state.thread.metrics.iteration ?? 0,
            staleCycles: state.thread.metrics.staleCycles ?? 0,
            cyclesSinceRebalance: state.thread.metrics.cyclesSinceRebalance ?? 0,
            lastSnapshot: state.thread.metrics.lastSnapshot,
            previousPrice: state.thread.metrics.previousPrice,
            latestCycle: state.thread.metrics.latestCycle,
          },
          task,
          profile: state.thread.profile,
          transactionHistory: state.thread.transactionHistory,
        },
      },
      createCommand: createLangGraphCommand,
    });
  }

  // Create clients on-demand (class instances don't survive LangGraph checkpointing)
  const camelotClient = getCamelotClient();
  const clients = await getOnchainClients();

  const iteration = (state.thread.metrics.iteration ?? 0) + 1;
  const threadId = (config as Configurable).configurable?.thread_id;
  const contextId = resolveAccountingContextId({ state, threadId });
  const storedFlowLog = threadId ? await loadFlowLogHistory({ threadId }) : [];
  const logCycleAccountingSummary = (accounting: AccountingState, note?: string) => {
    logAccountingSummary({ iteration, accounting, contextId, threadId, note });
  };
  logInfo('Polling cycle begin', { iteration, poolAddress: selectedPool.address });

  let staleCycles = state.thread.metrics.staleCycles ?? 0;
  let poolSnapshot: CamelotPool | undefined;
  let taskState = state.thread.task;
  const preCycleEvents: ClmmEvent[] = [];
  try {
    poolSnapshot =
      (await fetchPoolSnapshot(camelotClient, selectedPool.address, ARBITRUM_CHAIN_ID)) ??
      state.thread.metrics.lastSnapshot;
    staleCycles = 0;
  } catch (unknownError: unknown) {
    staleCycles += 1;
    const cause: string =
      unknownError instanceof Error
        ? unknownError.message
        : typeof unknownError === 'string'
          ? unknownError
          : 'Unknown error';
    const emberError = formatEmberApiError(unknownError);
    logInfo('Pool snapshot fetch failed; falling back to cache', {
      iteration,
      staleCycles,
      error: cause,
      ...(emberError ? { emberError } : {}),
    });
    if (staleCycles > DATA_STALE_CYCLE_LIMIT) {
      const failureMessage = `ERROR: Abort: Ember API unreachable for ${staleCycles} consecutive cycles (last error: ${cause})`;
      const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        thread: {
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        },
      });
      logCycleAccountingSummary(state.thread.accounting, 'cycle-abort: ember api unreachable');
      return buildNodeTransition({
        node: 'summarize',
        update: {
          thread: {
            haltReason: failureMessage,
            activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
            metrics: {
              staleCycles,
              iteration,
              cyclesSinceRebalance: state.thread.metrics.cyclesSinceRebalance ?? 0,
              lastSnapshot: state.thread.metrics.lastSnapshot,
              previousPrice: state.thread.metrics.previousPrice,
              latestCycle: state.thread.metrics.latestCycle,
            },
            task,
            profile: state.thread.profile,
            transactionHistory: state.thread.transactionHistory,
          },
        },
        createCommand: createLangGraphCommand,
      });
    }
    poolSnapshot = state.thread.metrics.lastSnapshot;
    const { task, statusEvent } = buildTaskStatus(
      taskState,
      'working',
      `WARNING: Using cached pool state (attempt ${staleCycles}/${DATA_STALE_CYCLE_LIMIT})`,
    );
    taskState = task;
    preCycleEvents.push(statusEvent);
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry } },
    });
  }

  if (!poolSnapshot) {
    const failureMessage = `ERROR: Unable to obtain Camelot pool snapshot after ${staleCycles} attempts`;
    const { task, statusEvent } = buildTaskStatus(taskState, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry } },
    });
    logCycleAccountingSummary(state.thread.accounting, 'cycle-abort: missing pool snapshot');
    return buildNodeTransition({
      node: 'summarize',
      update: {
        thread: {
          haltReason: failureMessage,
          activity: {
            events: [...preCycleEvents, statusEvent],
            telemetry: state.thread.activity.telemetry,
          },
          metrics: {
            staleCycles,
            iteration,
            cyclesSinceRebalance: state.thread.metrics.cyclesSinceRebalance ?? 0,
            lastSnapshot: state.thread.metrics.lastSnapshot,
            previousPrice: state.thread.metrics.previousPrice,
            latestCycle: state.thread.metrics.latestCycle,
          },
          task,
          profile: state.thread.profile,
          transactionHistory: state.thread.transactionHistory,
        },
      },
      createCommand: createLangGraphCommand,
    });
  }

  const midPrice = deriveMidPrice(poolSnapshot);
  const volatilityPct = computeVolatilityPct(midPrice, state.thread.metrics.previousPrice);
  const decimalsDiff = poolSnapshot.token0.decimals - poolSnapshot.token1.decimals;

  const walletPositions = await camelotClient.getWalletPositions(
    operatorConfig.walletAddress,
    ARBITRUM_CHAIN_ID,
  );
  const currentPositionRaw = walletPositions.find(
    (position) => position.poolAddress.toLowerCase() === poolSnapshot.address.toLowerCase(),
  );
  const currentPosition = currentPositionRaw ? normalizePosition(currentPositionRaw) : undefined;

  const ethUsd = resolveEthUsdPrice(poolSnapshot);
  if (!ethUsd) {
    logInfo('Missing WETH/USD price for pool', { poolAddress: poolSnapshot.address });
    const failureMessage = `ERROR: Unable to locate a WETH/USD price for pool ${poolSnapshot.address}`;
    const { task, statusEvent } = buildTaskStatus(taskState, 'failed', failureMessage);
    await copilotkitEmitState(config, { thread: { task, events: [statusEvent] } });
    logCycleAccountingSummary(state.thread.accounting, 'cycle-abort: missing eth price');
    return buildNodeTransition({
      node: 'summarize',
      update: {
        thread: {
          haltReason: failureMessage,
          events: [...preCycleEvents, statusEvent],
          staleCycles,
          iteration,
          task,
        },
      },
      createCommand: createLangGraphCommand,
    });
  }
  const maxGasSpendUsd = MAX_GAS_SPEND_ETH * ethUsd;
  const estimatedFeeValueUsd = estimateFeeValueUsd(currentPosition, poolSnapshot);
  const minAllocationPct = resolveMinAllocationPct();
  const positionValueUsd =
    state.thread.accounting.positionsUsd ?? state.thread.accounting.latestNavSnapshot?.totalUsd;
  const targetAllocationUsd = operatorConfig.baseContributionUsd;

  const rebalanceThresholdPct = resolveRebalanceThresholdPct();
  const decision = evaluateDecision({
    pool: poolSnapshot,
    position: currentPosition,
    positionValueUsd,
    targetAllocationUsd,
    minAllocationPct,
    midPrice,
    volatilityPct,
    cyclesSinceRebalance: state.thread.metrics.cyclesSinceRebalance ?? 0,
    tickBandwidthBps: operatorConfig.manualBandwidthBps,
    rebalanceThresholdPct,
    autoCompoundFees: operatorConfig.autoCompoundFees,
    maxGasSpendUsd,
    estimatedFeeValueUsd,
  });

  const targetRangeForLog =
    decision.kind === 'hold' || decision.kind === 'exit-range' || decision.kind === 'compound-fees'
      ? buildRange(
          midPrice,
          operatorConfig.manualBandwidthBps,
          poolSnapshot.tickSpacing,
          decimalsDiff,
        )
      : decision.targetRange;

  const positionLowerPrice = currentPosition
    ? tickToPrice(currentPosition.tickLower, decimalsDiff)
    : undefined;
  const positionUpperPrice = currentPosition
    ? tickToPrice(currentPosition.tickUpper, decimalsDiff)
    : undefined;
  const pctFromLower =
    currentPosition && positionLowerPrice !== undefined && midPrice > 0
      ? Number((((midPrice - positionLowerPrice) / midPrice) * 100).toFixed(4))
      : undefined;
  const pctToUpper =
    currentPosition && positionUpperPrice !== undefined && midPrice > 0
      ? Number((((positionUpperPrice - midPrice) / midPrice) * 100).toFixed(4))
      : undefined;
  const innerBand =
    currentPosition && rebalanceThresholdPct > 0
      ? (() => {
          const width = currentPosition.tickUpper - currentPosition.tickLower;
          const innerWidth = Math.round(width * rebalanceThresholdPct);
          const padding = Math.max(1, Math.floor((width - innerWidth) / 2));
          return {
            lowerTick: currentPosition.tickLower + padding,
            upperTick: currentPosition.tickUpper - padding,
          };
        })()
      : undefined;
  const distanceToEdges =
    currentPosition && innerBand
      ? {
          ticksFromLower: poolSnapshot.tick - currentPosition.tickLower,
          ticksToUpper: currentPosition.tickUpper - poolSnapshot.tick,
          pctFromLower,
          pctToUpper,
          innerBand: {
            lowerTick: innerBand.lowerTick,
            upperTick: innerBand.upperTick,
            ticksFromInnerLower: poolSnapshot.tick - innerBand.lowerTick,
            ticksToInnerUpper: innerBand.upperTick - poolSnapshot.tick,
          },
        }
      : currentPosition
        ? {
            ticksFromLower: poolSnapshot.tick - currentPosition.tickLower,
            ticksToUpper: currentPosition.tickUpper - poolSnapshot.tick,
            pctFromLower,
            pctToUpper,
          }
        : undefined;

  const inRange = currentPosition
    ? poolSnapshot.tick >= currentPosition.tickLower &&
      poolSnapshot.tick <= currentPosition.tickUpper
    : undefined;
  const inInnerBand = innerBand
    ? poolSnapshot.tick >= innerBand.lowerTick && poolSnapshot.tick <= innerBand.upperTick
    : undefined;

  const positionRangeTelemetry = currentPosition
    ? {
        lowerTick: currentPosition.tickLower,
        upperTick: currentPosition.tickUpper,
        lowerPrice: positionLowerPrice ?? tickToPrice(currentPosition.tickLower, decimalsDiff),
        upperPrice: positionUpperPrice ?? tickToPrice(currentPosition.tickUpper, decimalsDiff),
        widthTicks: currentPosition.tickUpper - currentPosition.tickLower,
      }
    : undefined;
  const targetRangeTelemetry = {
    lowerTick: targetRangeForLog.lowerTick,
    upperTick: targetRangeForLog.upperTick,
    lowerPrice: targetRangeForLog.lowerPrice,
    upperPrice: targetRangeForLog.upperPrice,
    widthTicks: targetRangeForLog.upperTick - targetRangeForLog.lowerTick,
    bandwidthBps: targetRangeForLog.bandwidthBps,
  };

  let cycleMetrics: NonNullable<RebalanceTelemetry['metrics']> = {
    tick: poolSnapshot.tick,
    tickSpacing: poolSnapshot.tickSpacing,
    midPrice,
    volatilityPct,
    tvlUsd: poolSnapshot.activeTvlUSD,
    rebalanceThresholdPct,
    cyclesSinceRebalance: state.thread.metrics.cyclesSinceRebalance ?? 0,
    bandwidthBps: targetRangeTelemetry.bandwidthBps,
    inRange,
    inInnerBand,
    positionRange: positionRangeTelemetry,
    targetRange: targetRangeTelemetry,
    distanceToEdges,
    estimatedFeeValueUsd,
    maxGasSpendUsd,
  };
  logInfo('Cycle metrics', { iteration, metrics: cycleMetrics }, { detailed: true });

  const decisionSummary: Pick<ClmmAction, 'kind' | 'reason'> & {
    targetRange?: { lowerTick: number; upperTick: number };
  } = { kind: decision.kind, reason: decision.reason };
  if ('targetRange' in decision) {
    decisionSummary.targetRange = {
      lowerTick: decision.targetRange.lowerTick,
      upperTick: decision.targetRange.upperTick,
    };
  }
  logInfo('Decision evaluated', { iteration, decision: decisionSummary });

  let cyclesSinceRebalance = state.thread.metrics.cyclesSinceRebalance ?? 0;
  let rebalanceCycles = state.thread.metrics.rebalanceCycles ?? 0;
  let txHash: string | undefined;
  let gasSpentWei: bigint | undefined;
  let executionFlowEvents: FlowLogEventInput[] = [];

  if (decision.kind === 'hold') {
    cyclesSinceRebalance += 1;
  } else {
    logInfo('Executing action', {
      iteration,
      action: decision.kind,
      reason: decision.reason,
    });
    if (DEBUG_MODE) {
      txHash = `0xdebug${Date.now().toString(16)}`;
    } else {
      try {
        const result = await executeDecision({
          action: decision,
          camelotClient,
          pool: poolSnapshot,
          operatorConfig,
          delegationBundle: state.thread.delegationBundle,
          fundingTokenAddress: state.thread.fundingTokenInput?.fundingTokenAddress,
          delegationsBypassActive: state.thread.delegationsBypassActive,
          clients,
        });
        txHash = result?.txHash;
        gasSpentWei = result?.gasSpentWei;
        executionFlowEvents = result?.flowEvents ?? [];
      } catch (executionError: unknown) {
        // Transaction failed (e.g., reverted on-chain) - log and gracefully stop this cycle
        // The cron job will retry on the next scheduled run
        const emberError = formatEmberApiError(executionError);
        const rawMessage =
          executionError instanceof Error
            ? executionError.message
            : typeof executionError === 'string'
              ? executionError
              : 'Unknown execution error';
        const rateLimitDetected = /Status:\s*429\b|"code"\s*:\s*429\b|code:\s*429\b/iu.test(
          rawMessage,
        );
        const errorMessage = emberError
          ? `Ember API ${emberError.status}${
              emberError.upstreamStatus ? ` (upstream ${emberError.upstreamStatus})` : ''
            }${emberError.path ? ` ${emberError.path}` : ''}: ${rawMessage}`
          : rawMessage;
        logInfo('Action execution failed', {
          iteration,
          action: decision.kind,
          error: errorMessage,
          ...(emberError ? { emberError } : {}),
        });

        // Schedule cron before returning so next cycle will run
        let cronScheduled = state.private.cronScheduled;
        if (threadId && !cronScheduled) {
          const intervalMs = state.private.pollIntervalMs ?? resolvePollIntervalMs();
          ensureCronForThread(threadId, intervalMs);
          logInfo('Cron scheduled after execution failure', { threadId });
          cronScheduled = true;
        }

        const failureStatusMessage = rateLimitDetected
          ? `[Cycle ${iteration}] warning: RPC rate limit (HTTP 429). Will retry next cycle.`
          : `[Cycle ${iteration}] ${decision.kind} FAILED: ${errorMessage}`;
        const { task: failedTask, statusEvent: failureEvent } = buildTaskStatus(
          taskState,
          'working', // Use 'working' not 'failed' - we'll retry on next cron cycle
          failureStatusMessage,
        );
        await copilotkitEmitState(config, {
          thread: {
            task: failedTask,
            activity: { events: [failureEvent], telemetry: state.thread.activity.telemetry },
            ...(rateLimitDetected ? {} : { executionError: errorMessage }),
          },
        });

        let accountingState = state.thread.accounting;
        try {
          const snapshot = await createCamelotAccountingSnapshot({
            state,
            camelotClient,
            trigger: 'cycle',
            threadId,
            cycle: iteration,
          });
          if (snapshot) {
            accountingState = applyAccountingUpdate({
              existing: accountingState,
              snapshots: [snapshot],
            });
          }
        } catch (accountingError: unknown) {
          const message =
            accountingError instanceof Error
              ? accountingError.message
              : typeof accountingError === 'string'
                ? accountingError
                : 'Unknown accounting error';
          logInfo('Accounting snapshot failed after execution error', { iteration, error: message });
        }
        logCycleAccountingSummary(accountingState, 'cycle-abort: execution failed');

        const { profile: nextProfile, metrics: nextMetrics } = applyAccountingToView({
          profile: state.thread.profile,
          metrics: {
            ...state.thread.metrics,
            lastSnapshot: poolSnapshot,
            previousPrice: midPrice,
            cyclesSinceRebalance: state.thread.metrics.cyclesSinceRebalance ?? 0,
            staleCycles,
            rebalanceCycles,
            iteration,
            latestCycle: state.thread.metrics.latestCycle,
          },
          accounting: accountingState,
        });

        // Return gracefully - don't throw. The cron job will run the next cycle.
        return buildNodeTransition({
          node: 'summarize',
          update: {
            thread: {
              metrics: nextMetrics,
              task: failedTask,
              activity: {
                telemetry: state.thread.activity.telemetry,
                events: [...preCycleEvents, failureEvent],
              },
              transactionHistory: state.thread.transactionHistory,
              profile: nextProfile,
              executionError: errorMessage, // Store error for debugging/display
              accounting: accountingState,
            },
            private: {
              cronScheduled,
            },
          },
          createCommand: createLangGraphCommand,
        });
      }
    }
    cyclesSinceRebalance = 0;
    if (decision.kind === 'enter-range' || decision.kind === 'adjust-range') {
      rebalanceCycles += 1;
    }
    logInfo('Action execution complete', {
      iteration,
      action: decision.kind,
      txHash,
      gasSpentWei: gasSpentWei?.toString(),
    });
  }

  const gasSpentUsd =
    gasSpentWei !== undefined
      ? (Number(gasSpentWei) / 1_000_000_000_000_000_000) * ethUsd
      : undefined;
  cycleMetrics = {
    ...cycleMetrics,
    gasSpentWei: gasSpentWei?.toString(),
    gasSpentUsd,
  };

  const cycleTelemetry: RebalanceTelemetry = {
    cycle: iteration,
    poolAddress: poolSnapshot.address,
    midPrice,
    action: decision.kind,
    reason: decision.reason,
    tickLower:
      decision.kind === 'hold' ||
      decision.kind === 'exit-range' ||
      decision.kind === 'compound-fees'
        ? undefined
        : decision.targetRange.lowerTick,
    tickUpper:
      decision.kind === 'hold' ||
      decision.kind === 'exit-range' ||
      decision.kind === 'compound-fees'
        ? undefined
        : decision.targetRange.upperTick,
    txHash,
    timestamp: new Date().toISOString(),
    metrics: cycleMetrics,
  };

  const cycleStatusMessage = `[Cycle ${iteration}] ${decision.kind}: ${decision.reason}${txHash ? ` (tx: ${txHash})` : ''}`;
  const { task, statusEvent } = buildTaskStatus(state.thread.task, 'working', cycleStatusMessage);
  await copilotkitEmitState(config, {
    thread: {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      metrics: { latestCycle: cycleTelemetry },
    },
  });

  const telemetryEvent: ClmmEvent = {
    type: 'artifact',
    artifact: buildTelemetryArtifact(cycleTelemetry),
    append: true,
  };

  // Schedule cron after first cycle completes (ensures no concurrent runs)
  let cronScheduled = state.private.cronScheduled;
  if (threadId && !cronScheduled) {
    const intervalMs = state.private.pollIntervalMs ?? resolvePollIntervalMs();
    ensureCronForThread(threadId, intervalMs);
    logInfo('Cron scheduled after first poll cycle', { threadId });
    cronScheduled = true;
  }

  const transactionEntry: ClmmState['thread']['transactionHistory'][number] | undefined =
    decision.kind === 'hold'
      ? undefined
      : {
          cycle: iteration,
          action: decision.kind,
          txHash,
          status: txHash ? ('success' as const) : ('failed' as const),
          reason: decision.reason,
          timestamp: cycleTelemetry.timestamp,
        };

  let accountingState =
    storedFlowLog.length > 0
      ? { ...state.thread.accounting, flowLog: storedFlowLog }
      : state.thread.accounting;
  try {
    const flowEvents =
      contextId && executionFlowEvents.length > 0
        ? executionFlowEvents.map((event) =>
            createFlowEvent({
              ...event,
              contextId,
              transactionHash: event.transactionHash ?? (txHash as `0x${string}` | undefined),
            }),
          )
        : [];

    if (!contextId && executionFlowEvents.length > 0) {
      logInfo('Accounting flow events skipped: missing threadId', { iteration });
    }

    if (flowEvents.length > 0) {
      await appendFlowLogHistory({ threadId, events: flowEvents });
      accountingState = applyAccountingUpdate({
        existing: accountingState,
        flowEvents,
      });
    }

    const baseSnapshot = await createCamelotAccountingSnapshot({
      state,
      camelotClient,
      trigger: 'cycle',
      threadId,
      cycle: iteration,
      flowLog: accountingState.flowLog,
    });

    if (baseSnapshot) {
      const snapshots = [baseSnapshot];
      if (txHash) {
        snapshots.push(
          cloneSnapshotForTrigger({
            snapshot: baseSnapshot,
            trigger: 'transaction',
            transactionHash: txHash as `0x${string}`,
          }),
        );
      }
      await appendNavSnapshotHistory({ threadId, snapshots });
      accountingState = applyAccountingUpdate({
        existing: accountingState,
        snapshots,
      });
    }
  } catch (accountingError: unknown) {
    const message =
      accountingError instanceof Error
        ? accountingError.message
        : typeof accountingError === 'string'
          ? accountingError
          : 'Unknown accounting error';
    logInfo('Accounting snapshot failed during poll cycle', { iteration, error: message });
  }
  logCycleAccountingSummary(accountingState, 'cycle-complete');

  await appendTelemetryHistory({ threadId, telemetry: [cycleTelemetry] });
  if (transactionEntry) {
    await appendTransactionHistory({ threadId, transactions: [transactionEntry] });
  }

  const { profile: nextProfile, metrics: nextMetrics } = applyAccountingToView({
    profile: state.thread.profile,
    metrics: {
      ...state.thread.metrics,
      lastSnapshot: poolSnapshot,
      previousPrice: midPrice,
      cyclesSinceRebalance,
      staleCycles,
      rebalanceCycles,
      iteration,
      latestCycle: cycleTelemetry,
    },
    accounting: accountingState,
  });

  return buildNodeTransition({
    node: 'summarize',
    update: {
      thread: {
        metrics: nextMetrics,
        task,
        activity: {
          telemetry: [cycleTelemetry],
          events: [telemetryEvent, statusEvent],
        },
        transactionHistory: transactionEntry
          ? [...state.thread.transactionHistory, transactionEntry]
          : state.thread.transactionHistory,
        profile: nextProfile,
        accounting: accountingState,
      },
      private: {
        cronScheduled,
      },
    },
    createCommand: createLangGraphCommand,
  });
};
