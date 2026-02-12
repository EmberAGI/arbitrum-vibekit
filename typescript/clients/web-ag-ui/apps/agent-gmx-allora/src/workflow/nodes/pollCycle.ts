import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolvePollIntervalMs } from '../../config/constants.js';
import { type AlloraPrediction, type GmxAlloraTelemetry } from '../../domain/types.js';
import { buildTelemetryArtifact } from '../artifacts.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';
import { ALLORA_PREDICTIONS } from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

const DECISION_THRESHOLD = 0.62;
const COOLDOWN_CYCLES = 2;
const CONNECT_DELAY_MS = 2500;
const CONNECT_DELAY_STEPS = 3;

function buildTxHash(iteration: number): string {
  return `0x${iteration.toString(16).padStart(64, '0')}`;
}

function shouldDelayIteration(iteration: number): boolean {
  return iteration % 3 === 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function adjustPrediction(prediction: AlloraPrediction, iteration: number): AlloraPrediction {
  const confidenceDelta = ((iteration % 3) - 1) * 0.05;
  const confidence = Math.min(0.9, Math.max(0.45, prediction.confidence + confidenceDelta));
  const flipDirection = iteration % 5 === 0;
  const direction = flipDirection ? (prediction.direction === 'up' ? 'down' : 'up') : prediction.direction;
  const priceDrift = (iteration % 4) * (direction === 'up' ? 45 : -35);

  return {
    ...prediction,
    confidence: Number(confidence.toFixed(2)),
    direction,
    predictedPrice: Number((prediction.predictedPrice + priceDrift).toFixed(2)),
    timestamp: new Date().toISOString(),
  };
}

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<Command<string, ClmmUpdate>> => {
  const { operatorConfig, selectedPool } = state.view;

  if (!operatorConfig || !selectedPool) {
    const failureMessage = 'ERROR: Polling node missing GMX strategy configuration';
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
  const basePrediction = ALLORA_PREDICTIONS[selectedPool.baseSymbol === 'BTC' ? 'BTC' : 'ETH'];
  const prediction = adjustPrediction(basePrediction, iteration);
  const strongSignal = prediction.confidence >= DECISION_THRESHOLD;

  const cyclesSinceTrade = state.view.metrics.cyclesSinceRebalance ?? 0;
  const cooldownRemaining =
    iteration === 1 ? 0 : Math.max(0, COOLDOWN_CYCLES - cyclesSinceTrade);
  const inCooldown = cooldownRemaining > 0;

  let action: GmxAlloraTelemetry['action'] = 'hold';
  let reason = 'Signal below confidence threshold; holding position.';

  if (inCooldown) {
    action = 'cooldown';
    reason = `Cooldown active for ${cooldownRemaining} more cycle(s).`;
  } else if (strongSignal) {
    if (iteration % 7 === 0) {
      action = 'close';
      reason = 'Strong signal reversal detected; closing position.';
    } else if (iteration % 5 === 0) {
      action = 'reduce';
      reason = 'Reducing exposure after consecutive signals.';
    } else {
      action = 'open';
      reason = `Opening ${prediction.direction} position based on Allora signal.`;
    }
  }

  const side = prediction.direction === 'up' ? 'long' : 'short';
  const leverage = Math.min(operatorConfig.maxLeverage, 2);
  const sizeUsd = Number((operatorConfig.baseContributionUsd * 0.9).toFixed(2));
  const txHash = ['open', 'reduce', 'close'].includes(action) ? buildTxHash(iteration) : undefined;
  const timestamp = new Date().toISOString();

  const telemetry: GmxAlloraTelemetry = {
    cycle: iteration,
    action,
    reason,
    marketSymbol: `${selectedPool.baseSymbol}/${selectedPool.quoteSymbol}`,
    side: ['open', 'reduce', 'close'].includes(action) ? side : undefined,
    leverage: ['open', 'reduce', 'close'].includes(action) ? leverage : undefined,
    sizeUsd: ['open', 'reduce', 'close'].includes(action) ? sizeUsd : undefined,
    prediction,
    txHash,
    timestamp,
    metrics: {
      confidence: prediction.confidence,
      decisionThreshold: DECISION_THRESHOLD,
      cooldownRemaining,
    },
  };

  const nextCyclesSinceTrade =
    ['open', 'reduce', 'close'].includes(action) ? 0 : cyclesSinceTrade + 1;

  const cycleStatusMessage = `[Cycle ${iteration}] ${action}: ${reason}${txHash ? ` (tx: ${txHash.slice(0, 10)}...)` : ''}`;
  let { task, statusEvent } = buildTaskStatus(state.view.task, 'working', cycleStatusMessage);
  await copilotkitEmitState(config, {
    view: {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      metrics: { latestCycle: telemetry },
    },
  });

  if (shouldDelayIteration(iteration)) {
    const stepDelayMs = Math.max(1, Math.floor(CONNECT_DELAY_MS / CONNECT_DELAY_STEPS));
    for (let step = 1; step <= CONNECT_DELAY_STEPS; step += 1) {
      const waitMessage = `[Cycle ${iteration}] streaming… (${step}/${CONNECT_DELAY_STEPS})`;
      const updated = buildTaskStatus(task, 'working', waitMessage);
      task = updated.task;
      statusEvent = updated.statusEvent;
      await copilotkitEmitState(config, {
        view: {
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: { latestCycle: telemetry },
        },
      });
      await delay(stepDelayMs);
    }
  }

  const telemetryEvent: ClmmEvent = {
    type: 'artifact',
    artifact: buildTelemetryArtifact(telemetry),
    append: true,
  };

  let cronScheduled = state.private.cronScheduled;
  const threadId = (config as Configurable).configurable?.thread_id;
  if (threadId && !cronScheduled) {
    const intervalMs = state.private.pollIntervalMs ?? resolvePollIntervalMs();
    ensureCronForThread(threadId, intervalMs);
    logInfo('Cron scheduled after first GMX cycle', { threadId });
    cronScheduled = true;
  }

  const transactionEntry = txHash
    ? {
        cycle: iteration,
        action,
        txHash,
        status: 'success' as const,
        reason,
        timestamp,
      }
    : undefined;

  const baseAum = state.view.profile.aum ?? 52_000;
  const baseIncome = state.view.profile.agentIncome ?? 5_400;
  const aumDelta = action === 'hold' || action === 'cooldown' ? 10 : 180;
  const incomeDelta = action === 'hold' || action === 'cooldown' ? 1.2 : 9.5;
  const nextProfile = {
    ...state.view.profile,
    aum: Number((baseAum + aumDelta).toFixed(2)),
    agentIncome: Number((baseIncome + incomeDelta).toFixed(2)),
  };

  return new Command({
    update: {
      view: {
        metrics: {
          lastSnapshot: selectedPool,
          previousPrice: prediction.predictedPrice,
          cyclesSinceRebalance: nextCyclesSinceTrade,
          staleCycles: state.view.metrics.staleCycles ?? 0,
          iteration,
          latestCycle: telemetry,
        },
        task,
        activity: {
          telemetry: [telemetry],
          events: [telemetryEvent, statusEvent],
        },
        transactionHistory: transactionEntry
          ? [...state.view.transactionHistory, transactionEntry]
          : state.view.transactionHistory,
        profile: nextProfile,
        selectedPool,
      },
      private: {
        cronScheduled,
      },
    },
    goto: 'summarize',
  });
};
