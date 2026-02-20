import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';
import { formatUnits, parseUnits } from 'viem';

import type { TokenizedYieldMarket, WalletBalance } from '../../clients/onchainActions.js';
import {
  resolvePendleChainIds,
  resolvePendleSmokeMode,
  resolvePendleTxExecutionMode,
  resolveStablecoinWhitelist,
} from '../../config/constants.js';
import { buildEligibleYieldTokens, toYieldToken } from '../../core/pendleMarkets.js';
import type { ResolvedPendleConfig } from '../../domain/types.js';
import {
  getAgentWalletAddress,
  getOnchainActionsClient,
  getOnchainClients,
} from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmEvent,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { executeInitialDeposit } from '../execution.js';
import { buildPendleLatestSnapshot, buildPendleLatestSnapshotFromOnchain } from '../viewMapping.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FULL_ONBOARDING_TOTAL_STEPS = 3;
const DELEGATION_APPROVAL_MESSAGE = 'Waiting for delegation approval to continue onboarding.';

const resolveOnboardingTotalSteps = (state: ClmmState): number => {
  const configuredTotalSteps = state.view.onboarding?.totalSteps;
  return typeof configuredTotalSteps === 'number' && configuredTotalSteps > 0
    ? configuredTotalSteps
    : FULL_ONBOARDING_TOTAL_STEPS;
};

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

const formatBaseUnitsForDisplay = (amountBaseUnits: bigint, decimals: number): string => {
  const formatted = formatUnits(amountBaseUnits, decimals);
  const normalized = formatted.replace(/(?:\.0+|(\.\d+?)0+)$/u, '$1');
  return normalized.length > 0 ? normalized : '0';
};

const isMarketMatured = (expiry: string): boolean => {
  const parsed = Date.parse(expiry);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed <= Date.now();
};

const parseUsdAmount = (balance: WalletBalance, fallbackDecimals: number): number => {
  if (typeof balance.valueUsd === 'number' && Number.isFinite(balance.valueUsd)) {
    return Math.max(0, balance.valueUsd);
  }
  const decimals = balance.decimals ?? fallbackDecimals;
  try {
    const tokenAmount = Number(formatUnits(BigInt(balance.amount), decimals));
    return Number.isFinite(tokenAmount) && tokenAmount > 0 ? tokenAmount : 0;
  } catch {
    return 0;
  }
};

const SMOKE_SETUP_TX_HASH = `0x${'0'.repeat(64)}` as const;

export const prepareOperatorNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const { operatorInput } = state.view;
  if (!operatorInput) {
    const totalSteps = resolveOnboardingTotalSteps(state);
    const message = 'Awaiting funding amount to continue onboarding.';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'input-required', message);
    const pendingView = {
      ...state.view,
      task,
      onboarding: { step: 1, totalSteps },
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    };
    await copilotkitEmitState(config, {
      view: pendingView,
    });
    return new Command({
      update: {
        view: pendingView,
      },
      goto: 'collectSetupInput',
    });
  }

  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  const fundingTokenInput = state.view.fundingTokenInput;
  if (!fundingTokenInput) {
    const totalSteps = resolveOnboardingTotalSteps(state);
    const message = 'Awaiting funding-token selection to continue onboarding.';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'input-required', message);
    const pendingView = {
      ...state.view,
      task,
      onboarding: { step: 2, totalSteps },
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    };
    await copilotkitEmitState(config, {
      view: pendingView,
    });
    return new Command({
      update: {
        view: pendingView,
      },
      goto: 'collectFundingTokenInput',
    });
  }

  const fundingTokenAddress = normalizeHexAddress(
    fundingTokenInput.fundingTokenAddress,
    'funding token address',
  );

  const delegationsBypassActive = state.view.delegationsBypassActive === true;
  if (!delegationsBypassActive && !state.view.delegationBundle) {
    const message = DELEGATION_APPROVAL_MESSAGE;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'input-required', message);
    const pendingView = {
      ...state.view,
      task,
      onboarding: state.view.onboarding,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    };
    await copilotkitEmitState(config, {
      view: pendingView,
    });
    return new Command({
      update: {
        view: pendingView,
      },
      goto: 'collectDelegations',
    });
  }

  const onchainActionsClient = getOnchainActionsClient();
  let eligibleYieldTokens = [];
  let tokenizedMarkets = [];
  let supportedTokens = [];
  let existingMarketAddress: string | undefined;
  let existingFundingTokenAddress: `0x${string}` | undefined;
  let existingPosition: Awaited<ReturnType<typeof onchainActionsClient.listTokenizedYieldPositions>>[number] | undefined;
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

    try {
      const positions = await onchainActionsClient.listTokenizedYieldPositions({
        walletAddress: operatorWalletAddress,
        chainIds,
      });
      const preferredPosition =
        positions.find((position) => {
          const matchedMarket = markets.find(
            (market) =>
              market.marketIdentifier.address.toLowerCase() ===
              position.marketIdentifier.address.toLowerCase(),
          );
          return Boolean(matchedMarket && !isMarketMatured(matchedMarket.expiry));
        }) ?? positions[0];
      const positionMarketAddress = preferredPosition?.marketIdentifier.address;
      if (positionMarketAddress) {
        existingPosition = preferredPosition;
        const matchedMarket = markets.find(
          (market) => market.marketIdentifier.address.toLowerCase() === positionMarketAddress.toLowerCase(),
        );
        if (matchedMarket) {
          existingMarketAddress = matchedMarket.marketIdentifier.address;
          existingFundingTokenAddress = normalizeHexAddress(
            matchedMarket.underlyingToken.tokenUid.address,
            'funding token address',
          );
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logInfo('Unable to detect existing Pendle positions during setup; continuing with market selection', {
        error: message,
      });
    }
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

  const existingMarket = existingMarketAddress
    ? tokenizedMarkets.find(
        (market) =>
          market.marketIdentifier.address.toLowerCase() === existingMarketAddress.toLowerCase(),
      )
    : undefined;
  const shouldPreferExistingMarket = Boolean(existingMarket && !isMarketMatured(existingMarket.expiry));
  const selectedYieldToken =
    state.view.selectedPool ??
    (shouldPreferExistingMarket && existingMarketAddress
      ? eligibleYieldTokens.find(
          (token) => token.marketAddress.toLowerCase() === existingMarketAddress.toLowerCase(),
        ) ??
        (() => {
          const matched = existingMarket;
          return matched ? toYieldToken(matched) : undefined;
        })()
      : undefined) ??
    bestYieldToken;

  const hasExistingPositionInSelectedMarket =
    Boolean(existingMarketAddress) &&
    selectedYieldToken.marketAddress.toLowerCase() === existingMarketAddress?.toLowerCase();

  const fundingTokenAddressResolved =
    hasExistingPositionInSelectedMarket && existingFundingTokenAddress
      ? existingFundingTokenAddress
      : fundingTokenAddress;

  let executionWalletAddress: `0x${string}` = operatorWalletAddress;
  if (delegationsBypassActive) {
    try {
      executionWalletAddress = getAgentWalletAddress();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const failureMessage = `ERROR: Delegations bypass requires a real agent wallet. ${message}`;
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
  }

  const operatorConfig: ResolvedPendleConfig = {
    // Always keep the owner wallet address for reading positions/balances.
    walletAddress: operatorWalletAddress,
    // Use a dedicated execution wallet when delegations bypass is enabled.
    executionWalletAddress,
    baseContributionUsd: operatorInput.baseContributionUsd ?? 10,
    fundingTokenAddress: fundingTokenAddressResolved,
    targetYieldToken: selectedYieldToken,
  };

  logInfo('Pendle strategy configuration established', {
    operatorWalletAddress,
    baseContributionUsd: operatorConfig.baseContributionUsd,
    fundingToken: operatorConfig.fundingTokenAddress,
    ytToken: selectedYieldToken.ytSymbol,
    apy: selectedYieldToken.apy,
    positionDetected: Boolean(existingMarketAddress),
  });

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    delegationsBypassActive
      ? `Delegation bypass active. Allocating into ${selectedYieldToken.ytSymbol} from agent wallet.`
      : `Delegations active. Allocating into ${selectedYieldToken.ytSymbol} from user wallet ${operatorWalletAddress}.`,
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  const events: ClmmEvent[] = [statusEvent];
  let setupComplete = state.view.setupComplete === true;
  let setupTxHash: `0x${string}` | undefined;
  const txExecutionMode = resolvePendleTxExecutionMode();

  if (!setupComplete) {
    if (hasExistingPositionInSelectedMarket) {
      // Do not force an initial deposit when the wallet already holds a PT position.
      setupComplete = true;
    } else if (resolvePendleSmokeMode()) {
      // Smoke mode is meant for UI and cron validation without requiring a funded agent wallet.
      setupTxHash = SMOKE_SETUP_TX_HASH;
      setupComplete = true;
    } else {
      const targetMarket = tokenizedMarkets.find(
        (market) =>
          market.marketIdentifier.address.toLowerCase() ===
          selectedYieldToken.marketAddress.toLowerCase(),
      );
      const fundingToken = supportedTokens.find(
        (token) =>
          token.tokenUid.address.toLowerCase() === operatorConfig.fundingTokenAddress.toLowerCase(),
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

      let walletBalances: WalletBalance[] | undefined;
      try {
        walletBalances = await onchainActionsClient.listWalletBalances(operatorWalletAddress);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logInfo('Unable to load wallet balances before initial deposit planning; proceeding without PT-liquidity adjustment', {
          error: message,
        });
      }

      const expiredMarketsByPtAddress = new Map<string, TokenizedYieldMarket>();
      for (const market of tokenizedMarkets) {
        if (isMarketMatured(market.expiry)) {
          expiredMarketsByPtAddress.set(market.ptToken.tokenUid.address.toLowerCase(), market);
        }
      }

      let expiredPtLiquidityUsd = 0;
      if (walletBalances) {
        for (const balance of walletBalances) {
          const matchedExpiredMarket = expiredMarketsByPtAddress.get(balance.tokenUid.address.toLowerCase());
          if (!matchedExpiredMarket) {
            continue;
          }
          expiredPtLiquidityUsd += parseUsdAmount(balance, matchedExpiredMarket.ptToken.decimals);
        }
      }

      const adjustedFundingUsd = Math.max(0, operatorConfig.baseContributionUsd - expiredPtLiquidityUsd);
      if (adjustedFundingUsd <= 0) {
        logInfo('Expired PT liquidity satisfies onboarding target; skipping initial deposit top-up', {
          targetUsd: operatorConfig.baseContributionUsd,
          expiredPtLiquidityUsd: Number(expiredPtLiquidityUsd.toFixed(6)),
        });
        setupComplete = true;
      } else {
        try {
          fundingAmount = resolveFundingAmount(adjustedFundingUsd, fundingToken.decimals);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          const failureMessage = `ERROR: Unable to resolve funding top-up amount: ${message}`;
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

      if (!setupComplete && txExecutionMode === 'execute') {
        try {
          const fetchedWalletBalances =
            walletBalances ?? (await onchainActionsClient.listWalletBalances(operatorWalletAddress));
          const selectedFundingTokenBalance = fetchedWalletBalances.find(
            (balance) =>
              balance.tokenUid.address.toLowerCase() ===
              operatorConfig.fundingTokenAddress.toLowerCase(),
          );
          const requiredBaseUnits = BigInt(fundingAmount);
          const availableBaseUnits = selectedFundingTokenBalance ? BigInt(selectedFundingTokenBalance.amount) : 0n;
          if (availableBaseUnits < requiredBaseUnits) {
            const requiredDisplay = formatBaseUnitsForDisplay(requiredBaseUnits, fundingToken.decimals);
            const availableDisplay = formatBaseUnitsForDisplay(availableBaseUnits, fundingToken.decimals);
            const failureMessage = `ERROR: Insufficient ${fundingToken.symbol} balance for initial deposit (required=${requiredDisplay}, available=${availableDisplay}).`;
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
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logInfo('Unable to validate funding token balance before initial deposit; proceeding to execution', {
            token: fundingToken.symbol,
            error: message,
          });
        }
      }

      if (!setupComplete) {
        try {
          const clients = txExecutionMode === 'execute' ? getOnchainClients() : undefined;
          const execution = await executeInitialDeposit({
            onchainActionsClient,
            clients,
            txExecutionMode,
            delegationBundle: delegationsBypassActive ? undefined : state.view.delegationBundle,
            walletAddress: operatorConfig.executionWalletAddress,
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
  }

  const transactionEntry = setupTxHash
    ? {
        cycle: 0,
        action: 'setup',
        txHash: setupTxHash,
        status: 'success' as const,
        reason: `Initial deposit into ${selectedYieldToken.ytSymbol}`,
        timestamp: new Date().toISOString(),
      }
    : undefined;

  const timestamp = new Date().toISOString();
  const positionOpenedAt = state.view.metrics.latestSnapshot?.positionOpenedAt ?? timestamp;
  const previousOpenedTotalUsd = state.view.metrics.latestSnapshot?.positionOpenedTotalUsd;
  // If the wallet already has a Pendle PT position, we don't have its true entry cost basis here.
  // In that case we initialize "opened value" to the current observed value so net PnL starts at 0.
  const positionOpenedTotalUsd = hasExistingPositionInSelectedMarket ? undefined : previousOpenedTotalUsd;

  let latestSnapshot = buildPendleLatestSnapshot({
    operatorConfig,
    totalUsd: operatorConfig.baseContributionUsd,
    timestamp,
    positionOpenedAt,
    positionOpenedTotalUsd,
  });
  try {
    const walletBalances = await onchainActionsClient.listWalletBalances(operatorWalletAddress);
    latestSnapshot = buildPendleLatestSnapshotFromOnchain({
      operatorConfig,
      position: hasExistingPositionInSelectedMarket ? existingPosition : undefined,
      walletBalances,
      timestamp,
      positionOpenedAt,
      positionOpenedTotalUsd,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logInfo('Unable to hydrate initial Pendle snapshot from wallet balances; using configured snapshot', {
      error: message,
    });
  }

  return {
    view: {
      operatorConfig,
      setupComplete,
      selectedPool: selectedYieldToken,
      metrics: {
        lastSnapshot: selectedYieldToken,
        previousApy: undefined,
        cyclesSinceRebalance: 0,
        staleCycles: 0,
        iteration: 0,
        latestCycle: undefined,
        aumUsd: operatorConfig.baseContributionUsd,
        apy: Number.isFinite(selectedYieldToken.apy) ? Number(selectedYieldToken.apy.toFixed(2)) : undefined,
        lifetimePnlUsd: undefined,
        pendle: {
          marketAddress: selectedYieldToken.marketAddress,
          ytSymbol: selectedYieldToken.ytSymbol,
          underlyingSymbol: selectedYieldToken.underlyingSymbol,
          maturity: selectedYieldToken.maturity,
          baseContributionUsd: operatorConfig.baseContributionUsd,
          fundingTokenAddress: operatorConfig.fundingTokenAddress,
          currentApy: Number.isFinite(selectedYieldToken.apy) ? Number(selectedYieldToken.apy.toFixed(4)) : undefined,
          bestApy: Number.isFinite(bestYieldToken.apy) ? Number(bestYieldToken.apy.toFixed(4)) : undefined,
          apyDelta: undefined,
          position: undefined,
        },
        latestSnapshot,
      },
      task,
      activity: { events, telemetry: state.view.activity.telemetry },
      transactionHistory: transactionEntry
        ? [...state.view.transactionHistory, transactionEntry]
        : state.view.transactionHistory,
      profile: {
        ...state.view.profile,
        aum: operatorConfig.baseContributionUsd,
        apy: Number.isFinite(selectedYieldToken.apy) ? Number(selectedYieldToken.apy.toFixed(2)) : undefined,
        pools: [
          selectedYieldToken,
          ...eligibleYieldTokens.filter(
            (token) => token.marketAddress.toLowerCase() !== selectedYieldToken.marketAddress.toLowerCase(),
          ),
        ],
        allowedPools: [
          selectedYieldToken,
          ...eligibleYieldTokens.filter(
            (token) => token.marketAddress.toLowerCase() !== selectedYieldToken.marketAddress.toLowerCase(),
          ),
        ],
      },
    },
    private: {
      cronScheduled: false,
    },
  };
};
