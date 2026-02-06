import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';
import { parseUnits } from 'viem';

import {
  resolvePendleChainIds,
  resolvePendleSmokeMode,
  resolvePendleTxExecutionMode,
  resolveStablecoinWhitelist,
} from '../../config/constants.js';
import { buildEligibleYieldTokens } from '../../core/pendleMarkets.js';
import type { ResolvedPendleConfig } from '../../domain/types.js';
import { getOnchainActionsClient, getOnchainClients } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { executeInitialDeposit } from '../execution.js';
import { AGENT_WALLET_ADDRESS } from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const resolveFundingAmount = (amountUsd: number, decimals: number): string => {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error(`Invalid funding amount: ${amountUsd}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }
  const fixed = amountUsd.toFixed(decimals);
  const baseUnits = parseUnits(fixed, decimals);
  if (baseUnits <= 0n) {
    throw new Error(`Resolved funding amount is too small: ${amountUsd}`);
  }
  return baseUnits.toString();
};

const SMOKE_SETUP_TX_HASH = `0x${'0'.repeat(64)}` as const;

export const prepareOperatorNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const { operatorInput } = state.view;
  if (!operatorInput) {
    const failureMessage = 'ERROR: Setup input missing';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const fundingTokenInput = state.view.fundingTokenInput;
  if (!fundingTokenInput) {
    const failureMessage = 'ERROR: Funding token input missing before strategy setup';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const fundingTokenAddress = normalizeHexAddress(
    fundingTokenInput.fundingTokenAddress,
    'funding token address',
  );

  const delegationsBypassActive = state.view.delegationsBypassActive === true;
  if (!delegationsBypassActive && !state.view.delegationBundle) {
    const failureMessage =
      'ERROR: Delegation bundle missing. Complete delegation signing before continuing.';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const onchainActionsClient = getOnchainActionsClient();
  let eligibleYieldTokens = [];
  let tokenizedMarkets = [];
  let supportedTokens = [];
  try {
    const chainIds = resolvePendleChainIds();
    const [markets, fetchedTokens] = await Promise.all([
      onchainActionsClient.listTokenizedYieldMarkets({ chainIds }),
      onchainActionsClient.listTokens({ chainIds }),
    ]);
    tokenizedMarkets = markets;
    supportedTokens = fetchedTokens;
    eligibleYieldTokens = buildEligibleYieldTokens({
      markets,
      supportedTokens: fetchedTokens,
      whitelistSymbols: resolveStablecoinWhitelist(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to fetch Pendle markets: ${message}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const bestYieldToken = eligibleYieldTokens[0];

  if (!bestYieldToken) {
    const failureMessage = 'ERROR: No Pendle YT markets available to select';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          task,
          profile: state.view.profile,
          transactionHistory: state.view.transactionHistory,
          metrics: state.view.metrics,
        },
      },
      goto: 'summarize',
    });
  }

  const operatorConfig: ResolvedPendleConfig = {
    walletAddress: delegationsBypassActive ? AGENT_WALLET_ADDRESS : operatorWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd ?? 10,
    fundingTokenAddress,
    targetYieldToken: bestYieldToken,
  };

  logInfo('Pendle strategy configuration established', {
    operatorWalletAddress,
    baseContributionUsd: operatorConfig.baseContributionUsd,
    fundingToken: fundingTokenAddress,
    ytToken: bestYieldToken.ytSymbol,
    apy: bestYieldToken.apy,
  });

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Allocating into ${bestYieldToken.ytSymbol} from agent wallet.`
      : `Delegations active. Allocating into ${bestYieldToken.ytSymbol} from user wallet ${operatorWalletAddress}.`,
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  const events: ClmmEvent[] = [statusEvent];
  let setupComplete = state.view.setupComplete === true;
  let setupTxHash: `0x${string}` | undefined;
  const txExecutionMode = resolvePendleTxExecutionMode();

  if (!setupComplete) {
    if (resolvePendleSmokeMode()) {
      // Smoke mode is meant for UI and cron validation without requiring a funded agent wallet.
      setupTxHash = SMOKE_SETUP_TX_HASH;
      setupComplete = true;
    } else {
      const targetMarket = tokenizedMarkets.find(
        (market) =>
          market.marketIdentifier.address.toLowerCase() ===
          bestYieldToken.marketAddress.toLowerCase(),
      );
      const fundingToken = supportedTokens.find(
        (token) => token.tokenUid.address.toLowerCase() === fundingTokenAddress.toLowerCase(),
      );

      if (!targetMarket || !fundingToken) {
        const failureMessage = 'ERROR: Missing tokenized yield data for initial deposit';
        const { task, statusEvent: errorEvent } = buildTaskStatus(
          state.view.task,
          'failed',
          failureMessage,
        );
        await copilotkitEmitState(config, {
          view: { task, activity: { events: [errorEvent], telemetry: state.view.activity.telemetry } },
        });
        return new Command({
          update: {
            view: {
              haltReason: failureMessage,
              executionError: failureMessage,
              activity: { events: [errorEvent], telemetry: state.view.activity.telemetry },
              task,
              profile: state.view.profile,
              transactionHistory: state.view.transactionHistory,
              metrics: state.view.metrics,
            },
          },
          goto: 'summarize',
        });
      }

      let fundingAmount: string;
      try {
        fundingAmount = resolveFundingAmount(operatorConfig.baseContributionUsd, fundingToken.decimals);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const failureMessage = `ERROR: Unable to resolve funding amount: ${message}`;
        const { task, statusEvent: errorEvent } = buildTaskStatus(
          state.view.task,
          'failed',
          failureMessage,
        );
        await copilotkitEmitState(config, {
          view: { task, activity: { events: [errorEvent], telemetry: state.view.activity.telemetry } },
        });
        return new Command({
          update: {
            view: {
              haltReason: failureMessage,
              executionError: failureMessage,
              activity: { events: [errorEvent], telemetry: state.view.activity.telemetry },
              task,
              profile: state.view.profile,
              transactionHistory: state.view.transactionHistory,
              metrics: state.view.metrics,
            },
          },
          goto: 'summarize',
        });
      }

      try {
        const clients = txExecutionMode === 'execute' ? getOnchainClients() : undefined;
        const execution = await executeInitialDeposit({
          onchainActionsClient,
          clients,
          txExecutionMode,
          walletAddress: operatorConfig.walletAddress,
          fundingToken,
          targetMarket,
          fundingAmount,
        });
        setupTxHash = execution.lastTxHash;
        setupComplete = true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const failureMessage = `ERROR: Pendle initial deposit failed: ${message}`;
        const { task, statusEvent: errorEvent } = buildTaskStatus(
          state.view.task,
          'failed',
          failureMessage,
        );
        await copilotkitEmitState(config, {
          view: { task, activity: { events: [errorEvent], telemetry: state.view.activity.telemetry } },
        });
        return new Command({
          update: {
            view: {
              haltReason: failureMessage,
              executionError: failureMessage,
              activity: { events: [errorEvent], telemetry: state.view.activity.telemetry },
              task,
              profile: state.view.profile,
              transactionHistory: state.view.transactionHistory,
              metrics: state.view.metrics,
            },
          },
          goto: 'summarize',
        });
      }
    }
  }

  const transactionEntry = setupTxHash
    ? {
        cycle: 0,
        action: 'setup',
        txHash: setupTxHash,
        status: 'success' as const,
        reason: `Initial deposit into ${bestYieldToken.ytSymbol}`,
        timestamp: new Date().toISOString(),
      }
    : undefined;

  return {
    view: {
      operatorConfig,
      setupComplete,
      selectedPool: bestYieldToken,
      metrics: {
        lastSnapshot: bestYieldToken,
        previousApy: undefined,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 0,
        latestCycle: undefined,
        aumUsd: operatorConfig.baseContributionUsd,
        apy: Number.isFinite(bestYieldToken.apy) ? Number(bestYieldToken.apy.toFixed(2)) : undefined,
        lifetimePnlUsd: undefined,
        pendle: {
          marketAddress: bestYieldToken.marketAddress,
          ytSymbol: bestYieldToken.ytSymbol,
          underlyingSymbol: bestYieldToken.underlyingSymbol,
          maturity: bestYieldToken.maturity,
          baseContributionUsd: operatorConfig.baseContributionUsd,
          fundingTokenAddress,
          currentApy: Number.isFinite(bestYieldToken.apy) ? Number(bestYieldToken.apy.toFixed(4)) : undefined,
          bestApy: Number.isFinite(bestYieldToken.apy) ? Number(bestYieldToken.apy.toFixed(4)) : undefined,
          apyDelta: undefined,
          position: undefined,
        },
      },
      task,
      activity: { events, telemetry: state.view.activity.telemetry },
      transactionHistory: transactionEntry
        ? [...state.view.transactionHistory, transactionEntry]
        : state.view.transactionHistory,
      profile: {
        ...state.view.profile,
        aum: operatorConfig.baseContributionUsd,
        apy: Number.isFinite(bestYieldToken.apy) ? Number(bestYieldToken.apy.toFixed(2)) : undefined,
        pools: eligibleYieldTokens,
        allowedPools: eligibleYieldTokens,
      },
    },
    private: {
      cronScheduled: false,
    },
  };
};
