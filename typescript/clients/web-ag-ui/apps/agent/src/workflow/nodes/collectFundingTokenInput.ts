import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  normalizeHexAddress,
  type ClmmState,
  type ClmmUpdate,
  type FundingTokenInterrupt,
  type OnboardingState,
} from '../context.js';
import { MOCK_FUNDING_TOKENS } from '../mockData.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

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
    logInfo('collectFundingTokenInput: operator input missing; rerouting to collectOperatorInput');
    return new Command({ goto: 'collectOperatorInput' });
  }

  const selectedPool =
    state.view.profile.allowedPools?.find(
      (pool) => pool.address.toLowerCase() === operatorInput.poolAddress.toLowerCase(),
    ) ?? state.view.profile.pools?.[0];

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${operatorInput.poolAddress} not available for funding step`;
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

  if (state.view.delegationsBypassActive === true) {
    logInfo('collectFundingTokenInput: bypass active; skipping step');
    return {
      view: {
        selectedPool,
        fundingTokenInput: state.view.fundingTokenInput,
        onboarding: { step: 2, key: FUNDING_STEP_KEY },
      },
    };
  }

  const request: FundingTokenInterrupt = {
    type: 'clmm-funding-token-request',
    message: 'Select a funding token for the mock swaps required to initialize the position.',
    payloadSchema: z.toJSONSchema(FundingTokenInputSchema),
    options: MOCK_FUNDING_TOKENS,
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
    selectedPool,
  };
  const currentTaskState = state.view.task?.taskStatus?.state;
  const currentTaskMessage = state.view.task?.taskStatus?.message?.content;
  const shouldPersistPendingState =
    currentTaskState !== 'input-required' || currentTaskMessage !== awaitingMessage;
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  if (hasRunnableConfig && shouldPersistPendingState) {
    state.view = { ...state.view, ...pendingView };
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
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
      },
    };
  }

  const normalizedFundingToken = normalizeHexAddress(
    parsed.data.fundingTokenAddress,
    'funding token address',
  );
  const isAllowed = MOCK_FUNDING_TOKENS.some(
    (option) => option.address.toLowerCase() === normalizedFundingToken.toLowerCase(),
  );
  if (!isAllowed) {
    const failureMessage = `Invalid funding-token input: address ${normalizedFundingToken} not in allowed options`;
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
      selectedPool,
      fundingTokenInput: input,
      onboarding: { step: 3, key: DELEGATION_STEP_KEY },
      task,
      activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
    },
  };
};
