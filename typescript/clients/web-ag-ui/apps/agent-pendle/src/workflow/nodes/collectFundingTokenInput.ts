import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { shouldPersistInputRequiredCheckpoint } from 'agent-workflow-core';
import { z } from 'zod';

import { resolvePendleChainIds, resolveStablecoinWhitelist } from '../../config/constants.js';
import { buildFundingTokenOptions } from '../../core/pendleFunding.js';
import { toYieldToken } from '../../core/pendleMarkets.js';
import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import { getOnchainActionsClient } from '../clientFactory.js';
import {
  applyViewPatch,
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

const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const resolveFundingOnboarding = (state: ClmmState): OnboardingState => {
  if (state.view.delegationsBypassActive === true) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  if (state.view.onboarding?.key === DELEGATION_STEP_KEY && state.view.onboarding.step === 2) {
    return state.view.onboarding;
  }
  return { step: 3, key: DELEGATION_STEP_KEY };
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
    const resumedView = applyViewPatch(state, {
      onboarding: resolveFundingOnboarding(state),
    });
    return {
      view: resumedView,
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
        const workingView = applyViewPatch(state, {
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        });
        await copilotkitEmitState(config, {
          view: workingView,
        });

        const completedView = applyViewPatch(state, {
          fundingTokenInput: input,
          selectedPool: toYieldToken(matchedMarket),
          onboarding: { step: 2, key: DELEGATION_STEP_KEY },
          task,
          activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
        });
        return {
          view: completedView,
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
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      profile: state.view.profile,
      metrics: state.view.metrics,
      transactionHistory: state.view.transactionHistory,
    });
    return new Command({
      update: {
        view: haltedView,
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
      onboarding: { step: 2, key: FUNDING_STEP_KEY },
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    };
    const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
      currentTaskState: state.view.task?.taskStatus?.state,
      currentTaskMessage: state.view.task?.taskStatus?.message?.content,
      currentOnboardingKey: state.view.onboarding?.key,
      nextOnboardingKey: pendingView.onboarding.key,
      nextTaskMessage: awaitingMessage,
    });
    const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
    if (hasRunnableConfig && shouldPersistPendingState) {
      const mergedView = applyViewPatch(state, pendingView);
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
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.view.task?.taskStatus?.state,
    currentTaskMessage: state.view.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.view.onboarding?.key,
    nextOnboardingKey: pendingView.onboarding.key,
    nextTaskMessage: awaitingMessage,
  });
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = applyViewPatch(state, pendingView);
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
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      profile: state.view.profile,
      metrics: state.view.metrics,
      transactionHistory: state.view.transactionHistory,
    });
    return new Command({
      update: {
        view: haltedView,
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
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      profile: state.view.profile,
      metrics: state.view.metrics,
      transactionHistory: state.view.transactionHistory,
    });
    return new Command({
      update: {
        view: haltedView,
      },
      goto: 'summarize',
    });
  }

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Funding token selected. Preparing delegation request.',
  );
  const workingView = applyViewPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    view: workingView,
  });

  const input: FundingTokenInput = {
    fundingTokenAddress: normalizedFundingToken,
  };

  const completedView = applyViewPatch(state, {
    fundingTokenInput: input,
    onboarding: { step: 3, key: DELEGATION_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
  });
  return {
    view: completedView,
  };
};
