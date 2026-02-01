import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { resolvePollIntervalMs } from '../../config/constants.js';
import { type PendleActionKind, type PendleTelemetry } from '../../domain/types.js';
import { buildTelemetryArtifact } from '../artifacts.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';
import { YIELD_TOKENS } from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

const ACTIONS: PendleActionKind[] = ['scan-yields', 'hold', 'compound', 'rebalance', 'hold', 'rollover'];
const CONNECT_DELAY_MS = 3000;
const CONNECT_DELAY_STEPS = 3;
const REBALANCE_THRESHOLD_PCT = 0.5;

function actionForIteration(iteration: number): PendleActionKind {
  const index = (iteration - 1) % ACTIONS.length;
  return ACTIONS[index] ?? 'hold';
}

function buildTxHash(iteration: number): string {
  return `0x${iteration.toString(16).padStart(64, '0')}`;
}

function shouldDelayIteration(iteration: number): boolean {
  return iteration % 3 === 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function adjustApy(baseApy: number, iteration: number, index: number): number {
  const drift = ((iteration + index) % 4 - 1.5) * 0.35;
  return Number(Math.max(1, baseApy + drift).toFixed(2));
}

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<Command<string, ClmmUpdate>> => {
  const { operatorConfig, selectedPool } = state.view;

  if (!operatorConfig) {
    const failureMessage = 'ERROR: Polling node missing Pendle strategy configuration';
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
  const baseAction = actionForIteration(iteration);

  const adjustedMarkets = YIELD_TOKENS.map((token, index) => ({
    token,
    apy: adjustApy(token.apy, iteration, index),
  }));

  const bestMarket = [...adjustedMarkets]
    .sort((a, b) => {
      if (b.apy !== a.apy) {
        return b.apy - a.apy;
      }
      return a.token.ytSymbol.localeCompare(b.token.ytSymbol);
    })
    .at(0);

  if (!bestMarket) {
    const failureMessage = 'ERROR: No Pendle markets available during cycle';
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

  const selectedMarket = selectedPool ?? bestMarket.token;
  const selectedMarketAdjusted =
    adjustedMarkets.find((market) => market.token.marketAddress === selectedMarket.marketAddress)?.apy ??
    selectedMarket.apy;

  const apyDelta = Number((bestMarket.apy - selectedMarketAdjusted).toFixed(2));
  const shouldRebalance = apyDelta >= REBALANCE_THRESHOLD_PCT;

  const action: PendleActionKind =
    baseAction === 'rebalance' && shouldRebalance ? 'rebalance' : baseAction;

  const nextMarket =
    action === 'rebalance' && bestMarket.token.marketAddress !== selectedMarket.marketAddress
      ? bestMarket.token
      : selectedMarket;

  const nextApy = action === 'rebalance' ? bestMarket.apy : selectedMarketAdjusted;

  let reason = 'Yield delta below rebalance threshold.';
  switch (action) {
    case 'scan-yields':
      reason = 'Scanning stablecoin YT markets for the best APY.';
      break;
    case 'rebalance':
      reason = shouldRebalance
        ? `Rotating into ${bestMarket.token.ytSymbol} (+${apyDelta}%) for higher yield.`
        : 'Best yield unchanged; holding current position.';
      break;
    case 'compound':
      reason = 'Compounding accrued Pendle yield.';
      break;
    case 'rollover':
      reason = `Preparing rollover for ${nextMarket.ytSymbol} maturity.`;
      break;
    case 'hold':
    default:
      reason = 'Yield steady; no rebalance required.';
      break;
  }

  const txHash = ['rebalance', 'compound', 'rollover'].includes(action) ? buildTxHash(iteration) : undefined;
  const timestamp = new Date().toISOString();
  const cycleTelemetry: PendleTelemetry = {
    cycle: iteration,
    action,
    reason,
    apy: nextApy,
    ytSymbol: nextMarket.ytSymbol,
    txHash,
    timestamp,
    metrics: {
      bestApy: bestMarket.apy,
      currentApy: nextApy,
      apyDelta,
      rebalanceThresholdPct: REBALANCE_THRESHOLD_PCT,
    },
  };

  const cyclesSinceRebalance = action === 'rebalance' ? 0 : (state.view.metrics.cyclesSinceRebalance ?? 0) + 1;

  const cycleStatusMessage = `[Cycle ${iteration}] ${action}: ${reason}${txHash ? ` (tx: ${txHash.slice(0, 10)}...)` : ''}`;
  let { task, statusEvent } = buildTaskStatus(state.view.task, 'working', cycleStatusMessage);
  await copilotkitEmitState(config, {
    view: {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      metrics: { latestCycle: cycleTelemetry },
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
          metrics: { latestCycle: cycleTelemetry },
        },
      });
      await delay(stepDelayMs);
    }
  }

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
    logInfo('Cron scheduled after first Pendle cycle', { threadId });
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

  const baseAum = state.view.profile.aum ?? 42_000;
  const baseIncome = state.view.profile.agentIncome ?? 4_100;
  const aumDelta = action === 'hold' ? 15 : 120;
  const incomeDelta = action === 'hold' ? 1.5 : 6;
  const nextProfile = {
    ...state.view.profile,
    aum: Number((baseAum + aumDelta).toFixed(2)),
    agentIncome: Number((baseIncome + incomeDelta).toFixed(2)),
    apy: Number(nextApy.toFixed(2)),
  };

  return new Command({
    update: {
      view: {
        metrics: {
          lastSnapshot: nextMarket,
          previousApy: nextApy,
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
        selectedPool: nextMarket,
      },
      private: {
        cronScheduled,
      },
    },
    goto: 'summarize',
  });
};
