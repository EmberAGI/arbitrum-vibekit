import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { requestInterruptPayload, shouldPersistInputRequiredCheckpoint } from 'agent-workflow-core';
import { z } from 'zod';

import { resolvePendleChainIds, resolveStablecoinWhitelist } from '../../config/constants.js';
import { buildFundingTokenOptions } from '../../core/pendleFunding.js';
import { toYieldToken } from '../../core/pendleMarkets.js';
import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import { getOnchainActionsClient } from '../clientFactory.js';
import {
  applyThreadPatch,
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
  if (state.thread.delegationsBypassActive === true) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  if (state.thread.onboarding?.key === DELEGATION_STEP_KEY && state.thread.onboarding.step === 2) {
    return state.thread.onboarding;
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
    hasOperatorInput: Boolean(state.thread.operatorInput),
    onboardingStep: state.thread.onboarding?.step,
  });

  const operatorInput = state.thread.operatorInput;
  if (!operatorInput) {
    logInfo('collectFundingTokenInput: setup input missing; rerouting to collectSetupInput');
    return new Command({ goto: 'collectSetupInput' });
  }

  if (state.thread.fundingTokenInput) {
    logInfo('collectFundingTokenInput: funding token already present; skipping step');
    const resumedView = applyThreadPatch(state, {
      onboarding: resolveFundingOnboarding(state),
    });
    return {
      thread: resumedView,
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
          state.thread.task,
          'working',
          `Detected an existing Pendle position. Using ${matchedMarket.underlyingToken.symbol} as the funding token.`,
        );
        const workingView = applyThreadPatch(state, {
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        });
        await copilotkitEmitState(config, {
          thread: workingView,
        });

        const completedView = applyThreadPatch(state, {
          fundingTokenInput: input,
          selectedPool: toYieldToken(matchedMarket),
          onboarding: { step: 2, key: DELEGATION_STEP_KEY },
          task,
          activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
        });
        return {
          thread: completedView,
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
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedView = applyThreadPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      profile: state.thread.profile,
      metrics: state.thread.metrics,
      transactionHistory: state.thread.transactionHistory,
    });
    return new Command({
      update: {
        thread: haltedView,
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

    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'input-required', message);
    const awaitingMessage = task.taskStatus.message?.content;
    const pendingView = {
      onboarding: { step: 2, key: FUNDING_STEP_KEY },
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    };
    const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
      currentTaskState: state.thread.task?.taskStatus?.state,
      currentTaskMessage: state.thread.task?.taskStatus?.message?.content,
      currentOnboardingKey: state.thread.onboarding?.key,
      nextOnboardingKey: pendingView.onboarding.key,
      nextTaskMessage: awaitingMessage,
    });
    const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
    if (hasRunnableConfig && shouldPersistPendingState) {
      const mergedView = applyThreadPatch(state, pendingView);
      await copilotkitEmitState(config, {
        thread: mergedView,
      });
      return new Command({
        update: {
          thread: mergedView,
        },
        goto: 'collectFundingTokenInput',
      });
    }

    const interruptResult = await requestInterruptPayload({
      request,
      interrupt,
    });
    const parsedAck = FundWalletAckSchema.safeParse(interruptResult.decoded);
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
    state.thread.task,
    'input-required',
    'Awaiting funding-token selection to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.thread.activity.telemetry },
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.thread.task?.taskStatus?.state,
    currentTaskMessage: state.thread.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.thread.onboarding?.key,
    nextOnboardingKey: pendingView.onboarding.key,
    nextTaskMessage: awaitingMessage,
  });
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = applyThreadPatch(state, pendingView);
    await copilotkitEmitState(config, {
      thread: mergedView,
    });
    return new Command({
      update: {
        thread: mergedView,
      },
      goto: 'collectFundingTokenInput',
    });
  }

  const interruptResult = await requestInterruptPayload({
    request,
    interrupt,
  });
  const parsed = FundingTokenInputSchema.safeParse(interruptResult.decoded);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid funding-token input: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedView = applyThreadPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      profile: state.thread.profile,
      metrics: state.thread.metrics,
      transactionHistory: state.thread.transactionHistory,
    });
    return new Command({
      update: {
        thread: haltedView,
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
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedView = applyThreadPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
      profile: state.thread.profile,
      metrics: state.thread.metrics,
      transactionHistory: state.thread.transactionHistory,
    });
    return new Command({
      update: {
        thread: haltedView,
      },
      goto: 'summarize',
    });
  }

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Funding token selected. Preparing delegation request.',
  );
  const workingView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    thread: workingView,
  });

  const input: FundingTokenInput = {
    fundingTokenAddress: normalizedFundingToken,
  };

  const completedView = applyThreadPatch(state, {
    fundingTokenInput: input,
    onboarding: { step: 3, key: DELEGATION_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  return {
    thread: completedView,
  };
};
