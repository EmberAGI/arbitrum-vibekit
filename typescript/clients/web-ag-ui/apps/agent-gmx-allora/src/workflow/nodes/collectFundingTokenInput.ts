import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import type { PerpetualMarket } from '../../clients/onchainActions.js';
import { ARBITRUM_CHAIN_ID, ONCHAIN_ACTIONS_API_URL } from '../../config/constants.js';
import { selectGmxPerpetualMarket } from '../../core/marketSelection.js';
import { type FundingTokenInput } from '../../domain/types.js';
import { getOnchainActionsClient } from '../clientFactory.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type OnboardingState,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FULL_ONBOARDING_TOTAL_STEPS = 3;
const REDUCED_ONBOARDING_TOTAL_STEPS = 2;

const buildOnboarding = (state: ClmmState, step: number): OnboardingState => ({
  step,
  totalSteps:
    state.view.delegationsBypassActive === true
      ? REDUCED_ONBOARDING_TOTAL_STEPS
      : FULL_ONBOARDING_TOTAL_STEPS,
});

function resolveUsdcTokenAddressFromMarket(market: PerpetualMarket): `0x${string}` {
  const longToken = market.longToken;
  const shortToken = market.shortToken;
  if (!longToken || !shortToken) {
    throw new Error('Selected GMX market is missing long/short token metadata.');
  }

  const candidates = [shortToken, longToken];
  const usdcToken = candidates.find((token) => token.symbol.toUpperCase() === 'USDC');
  if (!usdcToken) {
    throw new Error('Selected GMX market does not provide USDC collateral.');
  }

  return normalizeHexAddress(usdcToken.tokenUid.address, 'funding token address');
}

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

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'working',
    'Using USDC as collateral for GMX perps.',
  );
  await copilotkitEmitState(config, {
    view: {
      onboarding: buildOnboarding(state, 2),
      task: awaitingInput.task,
      activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
    },
  });

  let normalizedFundingToken: `0x${string}`;
  try {
    const onchainActionsClient = getOnchainActionsClient();
    const markets = await onchainActionsClient.listPerpetualMarkets({
      chainIds: [ARBITRUM_CHAIN_ID.toString()],
    });
    const selectedMarket = selectGmxPerpetualMarket({
      markets,
      baseSymbol: operatorInput.targetMarket,
      quoteSymbol: 'USDC',
    });
    if (!selectedMarket) {
      throw new Error(`No GMX ${operatorInput.targetMarket}/USDC market available`);
    }

    normalizedFundingToken = resolveUsdcTokenAddressFromMarket(selectedMarket);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const failureMessage = `ERROR: Failed to resolve USDC funding token from ${ONCHAIN_ACTIONS_API_URL}: ${message}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: state.view.activity.telemetry } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    };
  }

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'USDC collateral selected. Preparing delegation request.',
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
      onboarding: buildOnboarding(state, state.view.delegationsBypassActive === true ? 2 : 3),
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    },
  };
};
