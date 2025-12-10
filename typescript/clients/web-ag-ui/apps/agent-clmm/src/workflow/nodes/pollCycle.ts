import { Command } from '@langchain/langgraph';

import { ARBITRUM_CHAIN_ID, DATA_STALE_CYCLE_LIMIT, DEFAULT_REBALANCE_THRESHOLD_PCT, MAX_GAS_SPEND_ETH, resolveEthUsdPrice, resolvePollIntervalMs, resolveStreamLimit } from '../../config/constants.js';
import { fetchPoolSnapshot } from '../../clients/emberApi.js';
import { buildRange, computeVolatilityPct, deriveMidPrice, evaluateDecision, estimateFeeValueUsd, normalizePosition, tickToPrice } from '../../core/decision-engine.js';
import { sleep } from '../../core/utils.js';
import { type CamelotPool, type RebalanceTelemetry } from '../../domain/types.js';
import { buildTelemetryArtifact } from '../artifacts.js';
import { logInfo, type ClmmEvent, type ClmmState, type ClmmUpdate } from '../context.js';
import { executeDecision } from '../execution.js';

const DEBUG_MODE = process.env['DEBUG_MODE'] === 'true';

export const pollCycleNode = async (
  state: ClmmState,
): Promise<Command<string, ClmmUpdate>> => {
  const {
    camelotClient,
    operatorConfig,
    selectedPool,
    pollIntervalMs = resolvePollIntervalMs(),
    streamLimit = resolveStreamLimit(),
    clients,
  } = state;

  if (!camelotClient || !operatorConfig || !selectedPool || !clients) {
    throw new Error('Polling node missing required state');
  }

  const iteration = (state.iteration ?? 0) + 1;
  logInfo('Polling cycle begin', { iteration, poolAddress: selectedPool.address });

  let staleCycles = state.staleCycles ?? 0;
  let poolSnapshot: CamelotPool | undefined;
  try {
    poolSnapshot =
      (await fetchPoolSnapshot(camelotClient, selectedPool.address, ARBITRUM_CHAIN_ID)) ??
      state.lastSnapshot;
    staleCycles = 0;
  } catch (error) {
    staleCycles += 1;
    const cause =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error';
    logInfo('Pool snapshot fetch failed; falling back to cache', {
      iteration,
      staleCycles,
      error: cause,
    });
    if (staleCycles > DATA_STALE_CYCLE_LIMIT) {
      const status: ClmmEvent = {
        type: 'status',
        message: `ERROR: Abort: Ember API unreachable for ${staleCycles} consecutive cycles (last error: ${cause})`,
      };
      return new Command({
        update: {
          haltReason: status.message,
          events: [status],
          staleCycles,
          iteration,
        },
        goto: 'summarize',
      });
    }
    poolSnapshot = state.lastSnapshot;
    const warning: ClmmEvent = {
      type: 'status',
      message: `WARNING: Using cached pool state (attempt ${staleCycles}/${DATA_STALE_CYCLE_LIMIT})`,
    };
    return new Command({
      update: {
        staleCycles,
        iteration,
        events: [warning],
      },
      goto: 'pollCycle',
    });
  }

  if (!poolSnapshot) {
    throw new Error('Unable to obtain Camelot pool snapshot');
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
    throw new Error(`failure: Unable to locate a WETH/USD price for pool ${poolSnapshot.address}`);
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
      ? buildRange(midPrice, operatorConfig.manualBandwidthBps, poolSnapshot.tickSpacing, decimalsDiff)
      : decision.targetRange;

  const positionLowerPrice = currentPosition ? tickToPrice(currentPosition.tickLower, decimalsDiff) : undefined;
  const positionUpperPrice = currentPosition ? tickToPrice(currentPosition.tickUpper, decimalsDiff) : undefined;
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
    ? poolSnapshot.tick >= currentPosition.tickLower && poolSnapshot.tick <= currentPosition.tickUpper
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

  let cycleMetrics: RebalanceTelemetry['metrics'] = {
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
    gasSpentWei !== undefined ? (Number(gasSpentWei) / 1_000_000_000_000_000_000) * ethUsd : undefined;
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
      decision.kind === 'hold' || decision.kind === 'exit-range' || decision.kind === 'compound-fees'
        ? undefined
        : decision.targetRange.lowerTick,
    tickUpper:
      decision.kind === 'hold' || decision.kind === 'exit-range' || decision.kind === 'compound-fees'
        ? undefined
        : decision.targetRange.upperTick,
    txHash,
    timestamp: new Date().toISOString(),
    metrics: cycleMetrics,
  };

  const statusEvent: ClmmEvent = {
    type: 'status',
    message: `[Cycle ${iteration}] ${decision.kind}: ${decision.reason}${txHash ? ` (tx: ${txHash})` : ''}`,
  };

  const telemetryEvent: ClmmEvent = {
    type: 'artifact',
    artifact: buildTelemetryArtifact(cycleTelemetry),
    append: true,
  };

  const shouldStop = streamLimit >= 0 && iteration >= streamLimit;
  const goto = shouldStop ? 'summarize' : 'pollCycle';

  await sleep(pollIntervalMs);

  return new Command({
    update: {
      lastSnapshot: poolSnapshot,
      previousPrice: midPrice,
      cyclesSinceRebalance,
      staleCycles,
      iteration,
      telemetry: [cycleTelemetry],
      latestCycle: cycleTelemetry,
      events: [telemetryEvent, statusEvent],
    },
    goto,
  });
};
