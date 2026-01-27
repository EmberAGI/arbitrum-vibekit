import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolvePollIntervalMs } from '../../config/constants.js';
import { type ClmmActionKind, type RebalanceTelemetry } from '../../domain/types.js';
import { buildTelemetryArtifact } from '../artifacts.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

const ACTIONS: ClmmActionKind[] = ['hold', 'adjust-range', 'compound-fees', 'enter-range'];

function actionForIteration(iteration: number): ClmmActionKind {
  const index = (iteration - 1) % ACTIONS.length;
  return ACTIONS[index] ?? 'hold';
}

function reasonForAction(action: ClmmActionKind): string {
  switch (action) {
    case 'adjust-range':
      return 'Price drift exceeded mock threshold.';
    case 'compound-fees':
      return 'Fees reached mock compounding threshold.';
    case 'enter-range':
      return 'Position initialized for mock range.';
    case 'exit-range':
      return 'Price exited mock range.';
    case 'hold':
    default:
      return 'Price stable within mock band.';
  }
}

function buildMockTxHash(iteration: number): string {
  return `0x${iteration.toString(16).padStart(64, '0')}`;
}

function buildPoolSnapshot(params: {
  pool: ClmmState['view']['selectedPool'];
  iteration: number;
  tickDelta: number;
}): NonNullable<ClmmState['view']['selectedPool']> {
  const baseTvl = params.pool?.activeTvlUSD ?? 1_000_000;
  return {
    ...(params.pool ?? {
      address: '0x0000000000000000000000000000000000000000',
      token0: { address: '0x0', symbol: 'T0', decimals: 18 },
      token1: { address: '0x0', symbol: 'T1', decimals: 6 },
      tickSpacing: 60,
      tick: 0,
      liquidity: '0',
    }),
    tick: (params.pool?.tick ?? 0) + params.tickDelta,
    activeTvlUSD: baseTvl + params.iteration * 5_000,
  };
}

function computeVolatilityPct(previousPrice: number | undefined, midPrice: number): number {
  if (!previousPrice || previousPrice <= 0) {
    return 0;
  }
  return Number(((Math.abs(midPrice - previousPrice) / previousPrice) * 100).toFixed(4));
}

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<Command<string, ClmmUpdate>> => {
  const { operatorConfig, selectedPool } = state.view;

  if (!operatorConfig || !selectedPool) {
    const failureMessage = 'ERROR: Polling node missing operator configuration or selected pool';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: state.view.metrics,
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const iteration = (state.view.metrics.iteration ?? 0) + 1;
  const action = actionForIteration(iteration);
  const reason = reasonForAction(action);
  const tickSpacing = selectedPool.tickSpacing ?? 60;
  const tickDelta = action === 'hold' ? tickSpacing : tickSpacing * 2;
  const poolSnapshot = buildPoolSnapshot({ pool: selectedPool, iteration, tickDelta });

  const token0Price = selectedPool.token0.usdPrice ?? 2000;
  const token1Price = selectedPool.token1.usdPrice ?? 1;
  const impliedPrice = token1Price > 0 ? token0Price / token1Price : token0Price;
  const previousPrice = state.view.metrics.previousPrice ?? impliedPrice;
  const drift = ((iteration % 5) - 2) * 1.25;
  const midPrice = Number(Math.max(1, previousPrice + drift).toFixed(6));
  const volatilityPct = computeVolatilityPct(previousPrice, midPrice);

  const widthTicks = tickSpacing * 10;
  const lowerTick = poolSnapshot.tick - widthTicks;
  const upperTick = poolSnapshot.tick + widthTicks;
  const lowerPrice = Number((midPrice * 0.95).toFixed(6));
  const upperPrice = Number((midPrice * 1.05).toFixed(6));
  const rebalanceThresholdPct = 0.8;
  const inRange = action === 'hold';
  const inInnerBand = action === 'hold';

  const distanceToEdges = {
    ticksFromLower: poolSnapshot.tick - lowerTick,
    ticksToUpper: upperTick - poolSnapshot.tick,
    pctFromLower: Number((((midPrice - lowerPrice) / midPrice) * 100).toFixed(4)),
    pctToUpper: Number((((upperPrice - midPrice) / midPrice) * 100).toFixed(4)),
    innerBand: {
      lowerTick: lowerTick + tickSpacing,
      upperTick: upperTick - tickSpacing,
      ticksFromInnerLower: poolSnapshot.tick - (lowerTick + tickSpacing),
      ticksToInnerUpper: upperTick - tickSpacing - poolSnapshot.tick,
    },
  };

  const cycleMetrics: NonNullable<RebalanceTelemetry['metrics']> = {
    tick: poolSnapshot.tick,
    tickSpacing,
    midPrice,
    volatilityPct,
    tvlUsd: poolSnapshot.activeTvlUSD,
    rebalanceThresholdPct,
    cyclesSinceRebalance: state.view.metrics.cyclesSinceRebalance ?? 0,
    bandwidthBps: operatorConfig.manualBandwidthBps,
    inRange,
    inInnerBand,
    targetRange: {
      lowerTick,
      upperTick,
      lowerPrice,
      upperPrice,
      widthTicks,
      bandwidthBps: operatorConfig.manualBandwidthBps,
    },
    distanceToEdges,
    maxGasSpendUsd: 3,
  };

  const txHash = action === 'hold' ? undefined : buildMockTxHash(iteration);
  const timestamp = new Date().toISOString();
  const cycleTelemetry: RebalanceTelemetry = {
    cycle: iteration,
    poolAddress: poolSnapshot.address,
    midPrice,
    action,
    reason,
    tickLower: action === 'hold' ? undefined : lowerTick,
    tickUpper: action === 'hold' ? undefined : upperTick,
    txHash,
    timestamp,
    metrics: cycleMetrics,
  };

  const cyclesSinceRebalance = action === 'hold'
    ? (state.view.metrics.cyclesSinceRebalance ?? 0) + 1
    : 0;

  const cycleStatusMessage = `[Cycle ${iteration}] ${action}: ${reason}${txHash ? ` (tx: ${txHash.slice(0, 10)}...)` : ''}`;
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

  let cronScheduled = state.private.cronScheduled;
  const threadId = (config as Configurable).configurable?.thread_id;
  if (threadId && !cronScheduled) {
    const intervalMs = state.private.pollIntervalMs ?? resolvePollIntervalMs();
    ensureCronForThread(threadId, intervalMs);
    logInfo('Cron scheduled after first poll cycle', { threadId });
    cronScheduled = true;
  }

  const transactionEntry =
    action === 'hold'
      ? undefined
      : {
          cycle: iteration,
          action,
          txHash,
          status: txHash ? ('success' as const) : ('failed' as const),
          reason,
          timestamp,
        };

  const baseAum = state.view.profile.aum ?? 25_000;
  const baseIncome = state.view.profile.agentIncome ?? 3_250;
  const aumDelta = action === 'hold' ? 25 : 150;
  const incomeDelta = action === 'hold' ? 2 : 8;
  const nextProfile = {
    ...state.view.profile,
    aum: Number((baseAum + aumDelta).toFixed(2)),
    agentIncome: Number((baseIncome + incomeDelta).toFixed(2)),
  };

  return new Command({
    update: {
      view: {
        metrics: {
          lastSnapshot: poolSnapshot,
          previousPrice: midPrice,
          cyclesSinceRebalance,
          staleCycles: state.view.metrics.staleCycles ?? 0,
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
        profile: nextProfile,
      },
      private: {
        cronScheduled,
      },
    },
    goto: 'summarize',
  });
};
