import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import type { PerpetualMarket } from '../../clients/onchainActions.js';
import { ARBITRUM_CHAIN_ID, ONCHAIN_ACTIONS_API_URL } from '../../config/constants.js';
import { selectGmxPerpetualMarket } from '../../core/marketSelection.js';
import { type FundingTokenInput } from '../../domain/types.js';
import { getOnchainActionsClient } from '../clientFactory.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  logWarn,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type OnboardingState,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

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
): Promise<ClmmUpdate> => {
  logInfo('collectFundingTokenInput: entering node', {
    hasOperatorInput: Boolean(state.thread.operatorInput),
    onboardingStep: state.thread.onboarding?.step,
  });
  logWarn('collectFundingTokenInput: node entered', {
    hasOperatorInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    onboardingStatus: state.thread.onboardingFlow?.status,
    onboardingStep: state.thread.onboarding?.step,
    onboardingKey: state.thread.onboarding?.key,
  });

  const operatorInput = state.thread.operatorInput;
  if (!operatorInput) {
    logInfo('collectFundingTokenInput: setup input missing; rerouting to collectSetupInput');
    return {};
  }

  if (state.thread.fundingTokenInput) {
    logInfo('collectFundingTokenInput: funding token already present; skipping step');
    logWarn('collectFundingTokenInput: skipping funding token collection', {
      reason: 'funding-token-already-present-in-view',
      fundingTokenAddress: state.thread.fundingTokenInput.fundingTokenAddress,
      onboardingStatus: state.thread.onboardingFlow?.status,
      onboardingStep: state.thread.onboarding?.step,
      onboardingKey: state.thread.onboarding?.key,
    });
    const resumedView = applyThreadPatch(state, {
      onboarding:
        state.thread.delegationsBypassActive === true
          ? { step: 2, key: FUNDING_STEP_KEY }
          : state.thread.onboarding?.key === FUNDING_STEP_KEY
            ? { step: 3, key: DELEGATION_STEP_KEY }
            : { step: 2, key: DELEGATION_STEP_KEY },
    });
    return {
      thread: resumedView,
    };
  }

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'working',
    'Using USDC as collateral for GMX perps.',
  );
  const pendingView = applyThreadPatch(state, {
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.thread.activity.telemetry },
  });
  await copilotkitEmitState(config, {
    thread: pendingView,
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
    });
    return {
      thread: haltedView,
    };
  }

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'USDC collateral selected. Preparing delegation request.',
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
    onboarding:
      state.thread.delegationsBypassActive === true
        ? { step: 2, key: FUNDING_STEP_KEY }
        : { step: 3, key: DELEGATION_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  return {
    thread: completedView,
  };
};
