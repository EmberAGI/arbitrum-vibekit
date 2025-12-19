import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import {
  ARBITRUM_CHAIN_ID,
  DATA_STALE_CYCLE_LIMIT,
  DEFAULT_REBALANCE_THRESHOLD_PCT,
  MAX_GAS_SPEND_ETH,
  resolveEthUsdPrice,
  resolvePollIntervalMs,
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

const DEBUG_MODE = process.env['DEBUG_MODE'] === 'true';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = {
  configurable?: { thread_id?: string };
};

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<Command<string, ClmmUpdate>> => {
  const { operatorConfig, selectedPool } = state.view;

  if (!operatorConfig || !selectedPool) {
    const failureMessage =
      'ERROR: Polling node missing required state (operatorConfig or selectedPool)';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: {
            iteration: state.view.metrics.iteration ?? 0,
            staleCycles: state.view.metrics.staleCycles ?? 0,
            cyclesSinceRebalance: state.view.metrics.cyclesSinceRebalance ?? 0,
            lastSnapshot: state.view.metrics.lastSnapshot,
            previousPrice: state.view.metrics.previousPrice,
            latestCycle: state.view.metrics.latestCycle,
          },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  // Create clients on-demand (class instances don't survive LangGraph checkpointing)
  const camelotClient = getCamelotClient();
  const clients = await getOnchainClients();

  const iteration = (state.view.metrics.iteration ?? 0) + 1;
  logInfo('Polling cycle begin', { iteration, poolAddress: selectedPool.address });

  let staleCycles = state.view.metrics.staleCycles ?? 0;
  let poolSnapshot: CamelotPool | undefined;
  let taskState = state.view.task;
  const preCycleEvents: ClmmEvent[] = [];
  try {
    poolSnapshot =
      (await fetchPoolSnapshot(camelotClient, selectedPool.address, ARBITRUM_CHAIN_ID)) ??
      state.view.metrics.lastSnapshot;
    staleCycles = 0;
  } catch (unknownError: unknown) {
    staleCycles += 1;
    const cause: string =
      unknownError instanceof Error
        ? unknownError.message
        : typeof unknownError === 'string'
          ? unknownError
          : 'Unknown error';
    logInfo('Pool snapshot fetch failed; falling back to cache', {
      iteration,
      staleCycles,
      error: cause,
    });
    if (staleCycles > DATA_STALE_CYCLE_LIMIT) {
      const failureMessage = `ERROR: Abort: Ember API unreachable for ${staleCycles} consecutive cycles (last error: ${cause})`;
      const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        view: {
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        },
      });
      return new Command({
        update: {
          view: {
            haltReason: failureMessage,
            activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
            metrics: {
              staleCycles,
              iteration,
              cyclesSinceRebalance: state.view.metrics.cyclesSinceRebalance ?? 0,
              lastSnapshot: state.view.metrics.lastSnapshot,
              previousPrice: state.view.metrics.previousPrice,
              latestCycle: state.view.metrics.latestCycle,
            },
            task,
            profile: state.view.profile,
            transactionHistory: state.view.transactionHistory,
          },
        },
        goto: 'summarize',
      });
    }
    poolSnapshot = state.view.metrics.lastSnapshot;
    const { task, statusEvent } = buildTaskStatus(
      taskState,
      'working',
      `WARNING: Using cached pool state (attempt ${staleCycles}/${DATA_STALE_CYCLE_LIMIT})`,
    );
    taskState = task;
    preCycleEvents.push(statusEvent);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
  }

  if (!poolSnapshot) {
    const failureMessage = `ERROR: Unable to obtain Camelot pool snapshot after ${staleCycles} attempts`;
    const { task, statusEvent } = buildTaskStatus(taskState, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: {
            events: [...preCycleEvents, statusEvent],
            telemetry: state.view.activity.telemetry,
          },
          metrics: {
            staleCycles,
            iteration,
            cyclesSinceRebalance: state.view.metrics.cyclesSinceRebalance ?? 0,
            lastSnapshot: state.view.metrics.lastSnapshot,
            previousPrice: state.view.metrics.previousPrice,
            latestCycle: state.view.metrics.latestCycle,
          },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const midPrice = deriveMidPrice(poolSnapshot);
  const volatilityPct = computeVolatilityPct(midPrice, state.view.metrics.previousPrice);
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
    await copilotkitEmitState(config, { view: { task, events: [statusEvent] } });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          events: [...preCycleEvents, statusEvent],
          staleCycles,
          iteration,
          task,
        },
      },
      goto: 'summarize',
    });
  }
  const maxGasSpendUsd = MAX_GAS_SPEND_ETH * ethUsd;
  const estimatedFeeValueUsd = estimateFeeValueUsd(currentPosition, poolSnapshot);

  const rebalanceThresholdPct = DEFAULT_REBALANCE_THRESHOLD_PCT;
  const decision = evaluateDecision({
    pool: poolSnapshot,
    position: currentPosition,
    midPrice,
    volatilityPct,
    cyclesSinceRebalance: state.view.metrics.cyclesSinceRebalance ?? 0,
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
    cyclesSinceRebalance: state.view.metrics.cyclesSinceRebalance ?? 0,
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

  let cyclesSinceRebalance = state.view.metrics.cyclesSinceRebalance ?? 0;
  let txHash: string | undefined;
  let gasSpentWei: bigint | undefined;

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
          delegationBundle: state.view.delegationBundle,
          fundingTokenAddress: state.view.fundingTokenInput?.fundingTokenAddress,
          delegationsBypassActive: state.view.delegationsBypassActive,
          clients,
        });
        txHash = result?.txHash;
        gasSpentWei = result?.gasSpentWei;
      } catch (executionError: unknown) {
        // Transaction failed (e.g., reverted on-chain) - log and gracefully stop this cycle
        // The cron job will retry on the next scheduled run
        const errorMessage =
          executionError instanceof Error
            ? executionError.message
            : typeof executionError === 'string'
              ? executionError
              : 'Unknown execution error';
        logInfo('Action execution failed', {
          iteration,
          action: decision.kind,
          error: errorMessage,
        });

        // Schedule cron before returning so next cycle will run
        const threadId = (config as Configurable).configurable?.thread_id;
        let cronScheduled = state.private.cronScheduled;
        if (threadId && !cronScheduled) {
          const intervalMs = state.private.pollIntervalMs ?? resolvePollIntervalMs();
          ensureCronForThread(threadId, intervalMs);
          logInfo('Cron scheduled after execution failure', { threadId });
          cronScheduled = true;
        }

        const failureStatusMessage = `[Cycle ${iteration}] ${decision.kind} FAILED: ${errorMessage}`;
        const { task: failedTask, statusEvent: failureEvent } = buildTaskStatus(
          taskState,
          'working', // Use 'working' not 'failed' - we'll retry on next cron cycle
          failureStatusMessage,
        );
        await copilotkitEmitState(config, {
          view: {
            task: failedTask,
            activity: { events: [failureEvent], telemetry: state.view.activity.telemetry },
            executionError: errorMessage,
          },
        });

        // Return gracefully - don't throw. The cron job will run the next cycle.
        return new Command({
          update: {
            view: {
              metrics: {
                lastSnapshot: poolSnapshot,
                previousPrice: midPrice,
                cyclesSinceRebalance: state.view.metrics.cyclesSinceRebalance ?? 0, // Don't reset - we didn't complete
                staleCycles,
                iteration,
                latestCycle: state.view.metrics.latestCycle,
              },
              task: failedTask,
              activity: {
                telemetry: state.view.activity.telemetry,
                events: [...preCycleEvents, failureEvent],
              },
              transactionHistory: state.view.transactionHistory,
              profile: state.view.profile,
              executionError: errorMessage, // Store error for debugging/display
            },
            private: {
              cronScheduled,
            },
          },
          goto: 'summarize',
        });
      }
    }
    cyclesSinceRebalance = 0;
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
  const { task, statusEvent } = buildTaskStatus(state.view.task, 'working', cycleStatusMessage);
  await copilotkitEmitState(config, {
    view: {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      metrics: { latestCycle: cycleTelemetry },
    },
  });

  const telemetryEvent: ClmmEvent = {
    type: 'artifact',
    artifact: buildTelemetryArtifact(cycleTelemetry),
    append: true,
  };

  // Schedule cron after first cycle completes (ensures no concurrent runs)
  const threadId = (config as Configurable).configurable?.thread_id;
  let cronScheduled = state.private.cronScheduled;
  if (threadId && !cronScheduled) {
    const intervalMs = state.private.pollIntervalMs ?? resolvePollIntervalMs();
    ensureCronForThread(threadId, intervalMs);
    logInfo('Cron scheduled after first poll cycle', { threadId });
    cronScheduled = true;
  }

  const transactionEntry: ClmmState['view']['transactionHistory'][number] | undefined =
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

  return new Command({
    update: {
      view: {
        metrics: {
          lastSnapshot: poolSnapshot,
          previousPrice: midPrice,
          cyclesSinceRebalance,
          staleCycles,
          iteration,
          latestCycle: cycleTelemetry,
        },
        task,
        activity: {
          telemetry: [cycleTelemetry],
          events: [telemetryEvent, statusEvent],
        },
        transactionHistory: transactionEntry
          ? [...state.view.transactionHistory, transactionEntry]
          : state.view.transactionHistory,
        profile: state.view.profile,
      },
      private: {
        cronScheduled,
      },
    },
    goto: 'summarize',
  });
};
