import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { fetchAlloraInference } from '../../clients/allora.js';
import {
  ALLORA_HORIZON_HOURS,
  ALLORA_TOPIC_IDS,
  ALLORA_TOPIC_LABELS,
  ARBITRUM_CHAIN_ID,
  resolveAlloraApiBaseUrl,
  resolveAlloraApiKey,
  resolveAlloraChainId,
  resolveAlloraInferenceCacheTtlMs,
  resolveGmxAlloraTxSubmissionMode,
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
import { getEmbeddedOnchainClients, getOnchainActionsClient } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';
import { executePerpetualPlan } from '../execution.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

const DECISION_THRESHOLD = 0.62;
const COOLDOWN_CYCLES = 2;
const CONNECT_DELAY_MS = 2500;
const CONNECT_DELAY_STEPS = 3;
const ALLORA_STALE_CYCLE_LIMIT = 3;

function shouldDelayIteration(iteration: number): boolean {
  return iteration % 3 === 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTopicKey(symbol: string): 'BTC' | 'ETH' {
  return symbol === 'BTC' ? 'BTC' : 'ETH';
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
  const topicKey = resolveTopicKey(selectedPool.baseSymbol);
  const topicId = ALLORA_TOPIC_IDS[topicKey];
  const topicLabel = ALLORA_TOPIC_LABELS[topicKey];

  let prediction: AlloraPrediction;
  let staleCycles = state.view.metrics.staleCycles ?? 0;
  try {
    const inference = await fetchAlloraInference({
      baseUrl: resolveAlloraApiBaseUrl(),
      chainId: resolveAlloraChainId(),
      topicId,
      apiKey: resolveAlloraApiKey(),
      cacheTtlMs: resolveAlloraInferenceCacheTtlMs(),
    });
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
      return new Command({
        update: {
          view: {
            haltReason: failureMessage,
            activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
            metrics: { ...state.view.metrics, staleCycles, iteration },
            task,
            profile: state.view.profile,
            transactionHistory: state.view.transactionHistory,
          },
        },
        goto: 'summarize',
      });
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
      return new Command({
        update: {
          view: {
            haltReason: failureMessage,
            activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
            metrics: { ...state.view.metrics, staleCycles, iteration },
            task,
            profile: state.view.profile,
            transactionHistory: state.view.transactionHistory,
          },
        },
        goto: 'summarize',
      });
    }

    const warningMessage = `WARNING: Allora prediction unavailable (attempt ${staleCycles}/${ALLORA_STALE_CYCLE_LIMIT}); skipping trades this cycle.`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'working', warningMessage);
    await copilotkitEmitState(config, {
      view: {
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    });
    return new Command({
      update: {
        view: {
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: { ...state.view.metrics, staleCycles, iteration },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  let gmxMarketAddress: string;
  let positions = [];
  let payTokenDecimals = 6;
  try {
    const onchainActionsClient = getOnchainActionsClient();
    const chainIds = [ARBITRUM_CHAIN_ID.toString()];
    const [markets, walletPositions] = await Promise.all([
      onchainActionsClient.listPerpetualMarkets({ chainIds }),
      onchainActionsClient.listPerpetualPositions({
        walletAddress: operatorConfig.walletAddress,
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

    gmxMarketAddress = selectedMarket.marketToken.address;
    payTokenDecimals =
      [selectedMarket.longToken, selectedMarket.shortToken, selectedMarket.indexToken].find(
        (token) =>
          token?.tokenUid.address.toLowerCase() === operatorConfig.fundingTokenAddress.toLowerCase(),
      )?.decimals ?? 6;
    positions = walletPositions;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to fetch GMX markets/positions: ${message}`;
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

  const previousCycle = state.view.metrics.latestCycle;
  const { telemetry, nextCyclesSinceTrade: initialCyclesSinceTrade } = buildCycleTelemetry({
    prediction,
    decisionThreshold: DECISION_THRESHOLD,
    cooldownCycles: COOLDOWN_CYCLES,
    maxLeverage: operatorConfig.maxLeverage,
    baseContributionUsd: operatorConfig.baseContributionUsd,
    previousAction: previousCycle?.action,
    previousSide: previousCycle?.side,
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

  const nextCyclesSinceTrade =
    exposureAdjusted.action === 'hold' && telemetry.action === 'open'
      ? (state.view.metrics.cyclesSinceRebalance ?? 0) + 1
      : initialCyclesSinceTrade;

  const action = exposureAdjusted.action;
  const reason = exposureAdjusted.reason;
  const txHash = exposureAdjusted.txHash;

  const cycleStatusMessage = `[Cycle ${iteration}] ${action}: ${reason}${txHash ? ` (tx: ${txHash.slice(0, 10)}...)` : ''}`;
  let { task, statusEvent } = buildTaskStatus(state.view.task, 'working', cycleStatusMessage);
  await copilotkitEmitState(config, {
    view: {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      metrics: { latestCycle: exposureAdjusted },
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
          metrics: { latestCycle: exposureAdjusted },
        },
      });
      await delay(stepDelayMs);
    }
  }

  const telemetryEvent: ClmmEvent = {
    type: 'artifact',
    artifact: buildTelemetryArtifact(exposureAdjusted),
    append: true,
  };
  const executionPlan = buildPerpetualExecutionPlan({
    telemetry: exposureAdjusted,
    chainId: ARBITRUM_CHAIN_ID.toString(),
    marketAddress: gmxMarketAddress as `0x${string}`,
    walletAddress: operatorConfig.walletAddress,
    payTokenAddress: operatorConfig.fundingTokenAddress,
    payTokenDecimals,
    collateralTokenAddress: operatorConfig.fundingTokenAddress,
  });
  const txSubmissionMode = resolveGmxAlloraTxSubmissionMode();
  const executionResult = await executePerpetualPlan({
    client: getOnchainActionsClient(),
    plan: executionPlan,
    txSubmissionMode,
    clients: txSubmissionMode === 'submit' ? getEmbeddedOnchainClients() : undefined,
  });
  const executionPlanEvent: ClmmEvent | undefined =
    executionPlan.action === 'none'
      ? undefined
      : {
          type: 'artifact',
          artifact: buildExecutionPlanArtifact({ plan: executionPlan, telemetry: exposureAdjusted }),
          append: true,
        };
  const executionResultEvent: ClmmEvent | undefined =
    executionPlan.action === 'none'
      ? undefined
      : {
          type: 'artifact',
          artifact: buildExecutionResultArtifact({
            action: executionResult.action,
            ok: executionResult.ok,
            error: executionResult.error,
            txHashes: executionResult.txHashes,
            lastTxHash: executionResult.lastTxHash,
            telemetry: exposureAdjusted,
            transactions: executionResult.transactions,
          }),
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

  const submittedTxHash = executionResult.lastTxHash;
  const transactionEntry = submittedTxHash
    ? {
        cycle: iteration,
        action,
        txHash: submittedTxHash,
        status: executionResult.ok ? ('success' as const) : ('failed' as const),
        reason,
        timestamp: exposureAdjusted.timestamp,
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
          latestCycle: exposureAdjusted,
        },
        task,
        activity: {
          telemetry: [exposureAdjusted],
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
      },
      private: {
        cronScheduled,
      },
    },
    goto: 'summarize',
  });
};
