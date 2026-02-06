import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import { resolveStablecoinWhitelist } from '../../config/constants.js';
import { buildFundingTokenOptions } from '../../core/pendleFunding.js';
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

const ONBOARDING: Pick<OnboardingState, 'key' | 'totalSteps'> = {
  totalSteps: 3,
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
    const failureMessage = 'ERROR: Setup input missing before funding-token step';
    const { task, statusEvent } = buildTaskStatus(state.view.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return new Command({
      update: {
        view: {
          haltReason: failureMessage,
          task,
          activity: { events: [statusEvent], telemetry: [] },
          profile: state.view.profile,
          metrics: state.view.metrics,
          transactionHistory: state.view.transactionHistory,
        },
      },
      goto: 'summarize',
    });
  }

  const onchainActionsClient = getOnchainActionsClient();
  const operatorWalletAddress = normalizeHexAddress(operatorInput.walletAddress, 'wallet address');

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
    await copilotkitEmitState(config, {
      view: {
        onboarding: { ...ONBOARDING, step: 2 },
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    });

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
  await copilotkitEmitState(config, {
    view: {
      onboarding: { ...ONBOARDING, step: 2 },
      task: awaitingInput.task,
      activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
    },
  });

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
      onboarding: { ...ONBOARDING, step: 3 },
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    },
  };
};
