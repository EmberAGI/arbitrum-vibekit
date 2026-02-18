import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import { resolvePendleChainIds, resolveStablecoinWhitelist } from '../../config/constants.js';
import { buildFundingTokenOptions } from '../../core/pendleFunding.js';
import { toYieldToken } from '../../core/pendleMarkets.js';
import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import { getOnchainActionsClient } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type PendleFundWalletInterrupt,
  type FundingTokenInterrupt,
  type OnboardingState,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FULL_ONBOARDING_TOTAL_STEPS = 3;
const REDUCED_ONBOARDING_TOTAL_STEPS = 2;

const buildOnboarding = (
  step: number,
  totalSteps: number = FULL_ONBOARDING_TOTAL_STEPS,
): OnboardingState => ({
  step,
  totalSteps,
});

const resolveFundingOnboarding = (state: ClmmState): OnboardingState => {
  const configuredTotalSteps = state.view.onboarding?.totalSteps;
  const totalSteps =
    typeof configuredTotalSteps === 'number' && configuredTotalSteps > 0
      ? configuredTotalSteps
      : FULL_ONBOARDING_TOTAL_STEPS;
  return buildOnboarding(totalSteps <= 2 ? 2 : 3, totalSteps);
};

const FundWalletAckSchema = z.object({
  acknowledged: z.literal(true),
});

export const collectFundingTokenInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectFundingTokenInput: entering node', {
    hasOperatorInput: Boolean(state.view.operatorInput),
    onboardingStep: state.view.onboarding?.step,
  });

  const operatorInput = state.view.operatorInput;
  if (!operatorInput) {
    logInfo('collectFundingTokenInput: setup input missing; rerouting to collectSetupInput');
    return new Command({ goto: 'collectSetupInput' });
  }

  if (state.view.fundingTokenInput) {
    logInfo('collectFundingTokenInput: funding token already present; skipping step');
    return {
      view: {
        onboarding: resolveFundingOnboarding(state),
      },
    };
  }

  const onchainActionsClient = getOnchainActionsClient();
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

  // If the wallet already holds a tokenized yield position, use that market's underlying token
  // as the funding token and skip the selection interrupt entirely.
  try {
    const chainIds = resolvePendleChainIds();
    const positions = await onchainActionsClient.listTokenizedYieldPositions({
      walletAddress: operatorWalletAddress,
      chainIds,
    });
    if (positions.length > 0) {
      const markets = await onchainActionsClient.listTokenizedYieldMarkets({ chainIds });
      const positionMarketAddress = positions[0].marketIdentifier.address.toLowerCase();
      const matchedMarket = markets.find(
        (market) => market.marketIdentifier.address.toLowerCase() === positionMarketAddress,
      );
      if (matchedMarket) {
        const normalizedFundingToken = normalizeHexAddress(
          matchedMarket.underlyingToken.tokenUid.address,
          'funding token address',
        );
        const input: FundingTokenInput = { fundingTokenAddress: normalizedFundingToken };
        const { task, statusEvent } = buildTaskStatus(
          state.view.task,
          'working',
          `Detected an existing Pendle position. Using ${matchedMarket.underlyingToken.symbol} as the funding token.`,
        );
        await copilotkitEmitState(config, {
          view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
        });

        return {
          view: {
            fundingTokenInput: input,
            selectedPool: toYieldToken(matchedMarket),
            onboarding: buildOnboarding(2, REDUCED_ONBOARDING_TOTAL_STEPS),
            task,
            activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          },
        };
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logInfo('Unable to detect existing Pendle positions; falling back to funding token selection', {
      error: message,
    });
  }

  const whitelistSymbols = resolveStablecoinWhitelist();
  const loadOptions = async (): Promise<FundingTokenInterrupt['options']> => {
    const balances = await onchainActionsClient.listWalletBalances(operatorWalletAddress);
    return buildFundingTokenOptions({ balances, whitelistSymbols });
  };

  let options = [];
  try {
    options = await loadOptions();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Unable to fetch wallet balances: ${message}`;
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  if (options.length === 0) {
    const message =
      'WARNING: No eligible stablecoin balances found for funding token selection. Fund your wallet with an eligible stablecoin on Arbitrum (for example, USDai or USDC), then click Continue.';
    const request: PendleFundWalletInterrupt = {
      type: 'pendle-fund-wallet-request',
      message,
      payloadSchema: z.toJSONSchema(FundWalletAckSchema),
      artifactId: `pendle-fund-wallet-${Date.now()}`,
      walletAddress: operatorWalletAddress,
      whitelistSymbols,
    };

    const { task, statusEvent } = buildTaskStatus(state.view.task, 'input-required', message);
    const awaitingMessage = task.taskStatus.message?.content;
    const pendingView = {
      onboarding: buildOnboarding(2),
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    };
    const currentTaskState = state.view.task?.taskStatus?.state;
    const currentTaskMessage = state.view.task?.taskStatus?.message?.content;
    const shouldPersistPendingState =
      currentTaskState !== 'input-required' || currentTaskMessage !== awaitingMessage;
    const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
    if (hasRunnableConfig && shouldPersistPendingState) {
      const mergedView = { ...state.view, ...pendingView };
      state.view = mergedView;
      await copilotkitEmitState(config, {
        view: mergedView,
      });
      return new Command({
        update: {
          view: mergedView,
        },
        goto: 'collectFundingTokenInput',
      });
    }

    const incoming: unknown = await interrupt(request);
    let inputToParse: unknown = incoming;
    if (typeof incoming === 'string') {
      try {
        inputToParse = JSON.parse(incoming);
      } catch {
        // ignore
      }
    }

    const parsedAck = FundWalletAckSchema.safeParse(inputToParse);
    if (!parsedAck.success) {
      // Treat invalid responses as a no-op and keep the agent blocked.
      return new Command({ goto: '__end__' });
    }

    // This interrupt is intentionally an "ack + retry" flow.
    // We end the run here and let the UI trigger a new `cycle` run which re-checks balances
    // and proceeds into the next onboarding interrupt (funding token selection).
    return new Command({ goto: '__end__' });
  }

  const request: FundingTokenInterrupt = {
    type: 'pendle-funding-token-request',
    message: 'Select the starting stablecoin to fund the Pendle position.',
    payloadSchema: z.toJSONSchema(FundingTokenInputSchema),
    options,
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Awaiting funding-token selection to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: buildOnboarding(2),
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
  };
  const currentTaskState = state.view.task?.taskStatus?.state;
  const currentTaskMessage = state.view.task?.taskStatus?.message?.content;
  const shouldPersistPendingState =
    currentTaskState !== 'input-required' || currentTaskMessage !== awaitingMessage;
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = { ...state.view, ...pendingView };
    state.view = mergedView;
    await copilotkitEmitState(config, {
      view: mergedView,
    });
    return new Command({
      update: {
        view: mergedView,
      },
      goto: 'collectFundingTokenInput',
    });
  }

  const incoming: unknown = await interrupt(request);

  let inputToParse: unknown = incoming;
  if (typeof incoming === 'string') {
    try {
      inputToParse = JSON.parse(incoming);
    } catch {
      // ignore
    }
  }

  const parsed = FundingTokenInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid funding-token input: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const normalizedFundingToken = normalizeHexAddress(
    parsed.data.fundingTokenAddress,
    'funding token address',
  );
  const isAllowed = options.some(
    (option) => option.address.toLowerCase() === normalizedFundingToken.toLowerCase(),
  );
  if (!isAllowed) {
    const failureMessage = `Invalid funding-token input: address ${normalizedFundingToken} not in allowed options`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Funding token selected. Preparing delegation request.',
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
  });

  const input: FundingTokenInput = {
    fundingTokenAddress: normalizedFundingToken,
  };

  return {
    view: {
      fundingTokenInput: input,
      onboarding: buildOnboarding(3),
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    },
  };
};
