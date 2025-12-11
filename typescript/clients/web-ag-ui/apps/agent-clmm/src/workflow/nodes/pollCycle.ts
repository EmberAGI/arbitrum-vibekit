import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import {
  ARBITRUM_CHAIN_ID,
  DATA_STALE_CYCLE_LIMIT,
  DEFAULT_REBALANCE_THRESHOLD_PCT,
  MAX_GAS_SPEND_ETH,
  resolveEthUsdPrice,
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
import { type CamelotPool, type RebalanceTelemetry } from '../../domain/types.js';
import { buildTelemetryArtifact } from '../artifacts.js';
import { getCamelotClient, getOnchainClients } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { executeDecision } from '../execution.js';

const DEBUG_MODE = process.env['DEBUG_MODE'] === 'true';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<Command<string, ClmmUpdate>> => {
  const { operatorConfig, selectedPool } = state;

  if (!operatorConfig || !selectedPool) {
    const failureMessage =
      'ERROR: Polling node missing required state (operatorConfig or selectedPool)';
    const { task, statusEvent } = buildTaskStatus(state.task, 'failed', failureMessage);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return new Command({
      update: {
        haltReason: failureMessage,
        events: [statusEvent],
        iteration: state.iteration ?? 0,
        staleCycles: state.staleCycles ?? 0,
        task,
      },
      goto: 'summarize',
    });
  }

  // Create clients on-demand (class instances don't survive LangGraph checkpointing)
  const camelotClient = getCamelotClient();
  const clients = await getOnchainClients();

  const iteration = (state.iteration ?? 0) + 1;
  logInfo('Polling cycle begin', { iteration, poolAddress: selectedPool.address });

  let staleCycles = state.staleCycles ?? 0;
  let poolSnapshot: CamelotPool | undefined;
  let taskState = state.task;
  const preCycleEvents: ClmmEvent[] = [];
  try {
    poolSnapshot =
      (await fetchPoolSnapshot(camelotClient, selectedPool.address, ARBITRUM_CHAIN_ID)) ??
      state.lastSnapshot;
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
      const { task, statusEvent } = buildTaskStatus(state.task, 'failed', failureMessage);
      await copilotkitEmitState(config, { task, events: [statusEvent] });
      return new Command({
        update: {
          haltReason: failureMessage,
          events: [statusEvent],
          staleCycles,
          iteration,
          task,
        },
        goto: 'summarize',
      });
    }
    poolSnapshot = state.lastSnapshot;
    const { task, statusEvent } = buildTaskStatus(
      taskState,
      'working',
      `WARNING: Using cached pool state (attempt ${staleCycles}/${DATA_STALE_CYCLE_LIMIT})`,
    );
    taskState = task;
    preCycleEvents.push(statusEvent);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
  }

  if (!poolSnapshot) {
    const failureMessage = `ERROR: Unable to obtain Camelot pool snapshot after ${staleCycles} attempts`;
    const { task, statusEvent } = buildTaskStatus(taskState, 'failed', failureMessage);
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return new Command({
      update: {
        haltReason: failureMessage,
        events: [...preCycleEvents, statusEvent],
        staleCycles,
        iteration,
        task,
      },
      goto: 'summarize',
    });
  }

  const midPrice = deriveMidPrice(poolSnapshot);
  const volatilityPct = computeVolatilityPct(midPrice, state.previousPrice);
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
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return new Command({
      update: {
        haltReason: failureMessage,
        events: [...preCycleEvents, statusEvent],
        staleCycles,
        iteration,
        task,
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
    cyclesSinceRebalance: state.cyclesSinceRebalance ?? 0,
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
    cyclesSinceRebalance: state.cyclesSinceRebalance ?? 0,
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

  let cyclesSinceRebalance = state.cyclesSinceRebalance ?? 0;
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
      const result = await executeDecision({
        action: decision,
        camelotClient,
        pool: poolSnapshot,
        operatorConfig,
        clients,
      });
      txHash = result?.txHash;
      gasSpentWei = result?.gasSpentWei;
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
  const { task, statusEvent } = buildTaskStatus(state.task, 'working', cycleStatusMessage);
  await copilotkitEmitState(config, { task, events: [statusEvent], latestCycle: cycleTelemetry });

  const telemetryEvent: ClmmEvent = {
    type: 'artifact',
    artifact: buildTelemetryArtifact(cycleTelemetry),
    append: true,
  };

  const goto = 'summarize';

  return new Command({
    update: {
      lastSnapshot: poolSnapshot,
      previousPrice: midPrice,
      cyclesSinceRebalance,
      staleCycles,
      iteration,
      telemetry: [cycleTelemetry],
      latestCycle: cycleTelemetry,
      task,
      events: [telemetryEvent, statusEvent],
    },
    goto,
  });
};
