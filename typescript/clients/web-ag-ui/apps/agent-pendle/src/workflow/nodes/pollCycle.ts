import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import {
  resolvePendleChainIds,
  resolvePendleSmokeMode,
  resolvePendleTxExecutionMode,
  resolvePollIntervalMs,
  resolveRebalanceThresholdPct,
  resolveStablecoinWhitelist,
} from '../../config/constants.js';
import { evaluateRebalanceDecision } from '../../core/pendleDecision.js';
import { buildEligibleYieldTokens } from '../../core/pendleMarkets.js';
import { type PendleActionKind, type PendleTelemetry } from '../../domain/types.js';
import { buildTelemetryArtifact } from '../artifacts.js';
import { getOnchainActionsClient, getOnchainClients } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { ensureCronForThread } from '../cronScheduler.js';
import { executeCompound, executeRebalance, executeRollover } from '../execution.js';
import { buildPendleLatestSnapshot, buildPendleLatestSnapshotFromOnchain } from '../viewMapping.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

const CONNECT_DELAY_MS = 3000;
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

function formatDelta(value: number): number {
  return Number(value.toFixed(2));
}

function isMaturedMarket(maturity: string): boolean {
  const parsed = Date.parse(maturity);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed <= Date.now();
}

function hasClaimableRewards(position: { yt: { claimableRewards: { exactAmount: string }[] } }): boolean {
  return position.yt.claimableRewards.some((reward) => {
    try {
      return BigInt(reward.exactAmount) > 0n;
    } catch {
      return false;
    }
  });
}

function toRewardMetrics(
  rewards: Array<{ token: { symbol: string }; exactAmount: string }>,
): Array<{ symbol: string; amount: string }> {
  return rewards.map((reward) => ({
    symbol: reward.token.symbol,
    amount: reward.exactAmount,
  }));
}

export const pollCycleNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<Command<string, ClmmUpdate>> => {
  const { operatorConfig, selectedPool } = state.view;

  if (!operatorConfig) {
    const message =
      'WARNING: Pendle strategy configuration missing. Complete onboarding (funding token + strategy setup) before running cycles.';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'input-required', message);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });

    return new Command({
      update: {
        view: {
          haltReason: '',
          executionError: '',
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          metrics: state.view.metrics,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: '__end__',
    });
  }

  const iteration = (state.view.metrics.iteration ?? 0) + 1;
  const onchainActionsClient = getOnchainActionsClient();
  let eligibleMarkets = [];
  let currentMarket = selectedPool ?? operatorConfig.targetYieldToken;
  let tokenizedMarkets = [];
  let positions = [];

  try {
    const chainIds = resolvePendleChainIds();
    const [markets, supportedTokens, walletPositions] = await Promise.all([
      onchainActionsClient.listTokenizedYieldMarkets({ chainIds }),
      onchainActionsClient.listTokens({ chainIds }),
      onchainActionsClient.listTokenizedYieldPositions({
        walletAddress: operatorConfig.walletAddress,
        chainIds,
      }),
    ]);
    tokenizedMarkets = markets;
    positions = walletPositions;
    eligibleMarkets = buildEligibleYieldTokens({
      markets,
      supportedTokens,
      whitelistSymbols: resolveStablecoinWhitelist(),
    });
    if (walletPositions.length > 0) {
      const positionAddresses = new Set(
        walletPositions.map((position) => position.marketIdentifier.address.toLowerCase()),
      );
      const matched = eligibleMarkets.find((market) =>
        positionAddresses.has(market.marketAddress.toLowerCase()),
      );
      if (matched) {
        currentMarket = matched;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to refresh Pendle markets: ${message}`;
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

  const bestMarket = eligibleMarkets[0];
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

  let selectedMarket = currentMarket ?? bestMarket;
  const selectedStillEligible = eligibleMarkets.some(
    (market) => market.marketAddress.toLowerCase() === selectedMarket.marketAddress.toLowerCase(),
  );
  if (!selectedStillEligible) {
    selectedMarket = bestMarket;
  }
  const thresholdPct = resolveRebalanceThresholdPct();
  const decision = evaluateRebalanceDecision({
    bestToken: bestMarket,
    currentToken: selectedMarket,
    thresholdPct,
  });

  const selectedPosition = positions.find(
    (entry) =>
      entry.marketIdentifier.address.toLowerCase() === selectedMarket.marketAddress.toLowerCase(),
  );
  const rolloverNeeded = isMaturedMarket(selectedMarket.maturity);
  const compoundEligible = selectedPosition ? hasClaimableRewards(selectedPosition) : false;
  const smokeMode = resolvePendleSmokeMode();
  const txExecutionMode = resolvePendleTxExecutionMode();

  let action: PendleActionKind;
  let nextMarket = decision.nextToken;

  if (rolloverNeeded) {
    action = 'rollover';
    nextMarket = bestMarket;
  } else if (compoundEligible) {
    action = 'compound';
    nextMarket = selectedMarket;
  } else {
    action = decision.shouldRebalance ? 'rebalance' : 'hold';
    nextMarket = decision.nextToken;
  }
  const nextApy = nextMarket.apy;

  if (smokeMode && !selectedPosition && (action === 'rebalance' || action === 'rollover' || action === 'compound')) {
    // In smoke mode we prioritize validating UI + cron updates over requiring a real onchain position.
    action = 'hold';
    nextMarket = selectedMarket;
  }

  let reason = 'Yield delta below rebalance threshold.';
  switch (action) {
    case 'rebalance':
      reason = decision.shouldRebalance
        ? `Rotating into ${bestMarket.ytSymbol} (+${formatDelta(decision.apyDelta)}%) for higher yield.`
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

  let executionTxHash: `0x${string}` | undefined;
  if (action === 'rebalance' || action === 'rollover' || action === 'compound') {
    const currentTokenized = tokenizedMarkets.find(
      (market) =>
        market.marketIdentifier.address.toLowerCase() === selectedMarket.marketAddress.toLowerCase(),
    );
    const nextTokenized = tokenizedMarkets.find(
      (market) => market.marketIdentifier.address.toLowerCase() === nextMarket.marketAddress.toLowerCase(),
    );

    if (!currentTokenized || !selectedPosition || (action !== 'compound' && !nextTokenized)) {
      const failureMessage =
        action === 'rollover'
          ? 'ERROR: Missing tokenized yield data needed to rollover'
          : action === 'compound'
            ? 'ERROR: Missing tokenized yield data needed to compound'
            : 'ERROR: Missing tokenized yield data needed to rebalance';
      const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
      });
      return new Command({
        update: {
          view: {
            haltReason: failureMessage,
            executionError: failureMessage,
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

    try {
      if (!smokeMode) {
        const clients = txExecutionMode === 'execute' ? getOnchainClients() : undefined;
        if (action === 'compound') {
          const execution = await executeCompound({
            onchainActionsClient,
            txExecutionMode,
            clients,
            walletAddress: operatorConfig.walletAddress,
            position: selectedPosition,
            currentMarket: currentTokenized,
          });
          executionTxHash = execution.lastTxHash;
        } else if (action === 'rollover') {
          const execution = await executeRollover({
            onchainActionsClient,
            txExecutionMode,
            clients,
            walletAddress: operatorConfig.walletAddress,
            position: selectedPosition,
            currentMarket: currentTokenized,
            targetMarket: nextTokenized!,
          });
          executionTxHash = execution.lastTxHash;
        } else {
          const execution = await executeRebalance({
            onchainActionsClient,
            txExecutionMode,
            clients,
            walletAddress: operatorConfig.walletAddress,
            position: selectedPosition,
            currentMarket: currentTokenized,
            targetMarket: nextTokenized!,
          });
          executionTxHash = execution.lastTxHash;
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const failureMessage =
        action === 'rollover'
          ? `ERROR: Pendle rollover execution failed: ${message}`
          : action === 'compound'
            ? `ERROR: Pendle compound execution failed: ${message}`
            : `ERROR: Pendle rebalance execution failed: ${message}`;
      const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
      await copilotkitEmitState(config, {
        view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
      });
      return new Command({
        update: {
          view: {
            haltReason: failureMessage,
            executionError: failureMessage,
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
  }

  const txHash =
    ['rebalance', 'compound', 'rollover'].includes(action) && executionTxHash
      ? executionTxHash
      : ['rebalance', 'compound', 'rollover'].includes(action)
        ? buildTxHash(iteration)
        : undefined;
  const timestamp = new Date().toISOString();
  const strategyMarketAddress = nextMarket.marketAddress;
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
      apyDelta: decision.apyDelta,
      rebalanceThresholdPct: thresholdPct,
    },
  };

  const cyclesSinceRebalance =
    action === 'rebalance' || action === 'rollover'
      ? 0
      : (state.view.metrics.cyclesSinceRebalance ?? 0) + 1;

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

  const configuredAumUsd = Number(
    operatorConfig.baseContributionUsd ?? state.settings.amount ?? 0,
  );
  const aumUsd = Number.isFinite(configuredAumUsd) && configuredAumUsd > 0 ? configuredAumUsd : undefined;

  const normalizedFundingTokenAddress = operatorConfig.fundingTokenAddress;
  const normalizedMarketAddress = strategyMarketAddress;
  const nextPosition = positions.find(
    (entry) => entry.marketIdentifier.address.toLowerCase() === normalizedMarketAddress.toLowerCase(),
  );

  const positionMetric = nextPosition
    ? {
        marketAddress: normalizedMarketAddress,
        ptSymbol: nextPosition.pt.token.symbol,
        ptAmount: nextPosition.pt.exactAmount,
        ytSymbol: nextPosition.yt.token.symbol,
        ytAmount: nextPosition.yt.exactAmount,
        claimableRewards: toRewardMetrics(nextPosition.yt.claimableRewards),
      }
    : undefined;

  const snapshotConfig = {
    ...operatorConfig,
    targetYieldToken: nextMarket,
  };
  const positionOpenedAt = state.view.metrics.latestSnapshot?.positionOpenedAt ?? timestamp;
  let latestSnapshot = buildPendleLatestSnapshot({
    operatorConfig: snapshotConfig,
    totalUsd: aumUsd,
    timestamp,
    positionOpenedAt,
  });

  try {
    const walletBalances = await onchainActionsClient.listWalletBalances(operatorConfig.walletAddress);
    latestSnapshot = buildPendleLatestSnapshotFromOnchain({
      operatorConfig: snapshotConfig,
      position: nextPosition,
      walletBalances,
      timestamp,
      positionOpenedAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logInfo('Unable to hydrate Pendle snapshot from wallet balances; falling back to configured snapshot', {
      error: message,
    });
  }

  const nextProfile = {
    ...state.view.profile,
    aum: aumUsd,
    agentIncome: state.view.profile.agentIncome,
    apy: Number.isFinite(nextApy) ? Number(nextApy.toFixed(2)) : state.view.profile.apy,
    pools: eligibleMarkets,
    allowedPools: eligibleMarkets,
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
          aumUsd,
          apy: Number.isFinite(nextApy) ? Number(nextApy.toFixed(2)) : undefined,
          lifetimePnlUsd: state.view.metrics.lifetimePnlUsd,
          pendle: {
            marketAddress: normalizedMarketAddress,
            ytSymbol: nextMarket.ytSymbol,
            underlyingSymbol: nextMarket.underlyingSymbol,
            maturity: nextMarket.maturity,
            baseContributionUsd: aumUsd,
            fundingTokenAddress: normalizedFundingTokenAddress,
            currentApy: Number.isFinite(nextApy) ? Number(nextApy.toFixed(4)) : undefined,
            bestApy: Number.isFinite(bestMarket.apy) ? Number(bestMarket.apy.toFixed(4)) : undefined,
            apyDelta: Number.isFinite(decision.apyDelta) ? formatDelta(decision.apyDelta) : undefined,
            position: positionMetric,
          },
          latestSnapshot,
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
