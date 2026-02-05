import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command } from '@langchain/langgraph';

import { type FundingTokenInput } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type OnboardingState,
} from '../context.js';
import { FUNDING_TOKENS } from '../seedData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const ONBOARDING: Pick<OnboardingState, 'key' | 'totalSteps'> = {
  totalSteps: 3,
};

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
      onboarding: { ...ONBOARDING, step: 2 },
      task: awaitingInput.task,
      activity: { events: [awaitingInput.statusEvent], telemetry: state.view.activity.telemetry },
    },
  });

  const usdcOption = FUNDING_TOKENS.find((option) => option.symbol.toUpperCase() === 'USDC');
  if (!usdcOption) {
    const failureMessage = 'ERROR: USDC funding option unavailable for GMX onboarding.';
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

  const normalizedFundingToken = normalizeHexAddress(
    usdcOption.address,
    'funding token address',
  );
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
      onboarding: { ...ONBOARDING, step: 3 },
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    },
  };
};
