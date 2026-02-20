import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { shouldPersistInputRequiredCheckpoint } from 'agent-workflow-core';
import { z } from 'zod';

import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import {
  applyViewPatch,
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
    const failedView = applyViewPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: [] },
    });
    await copilotkitEmitState(config, {
      view: failedView,
    });
    const haltedView = applyViewPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: [] },
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
    });
    return {
      view: haltedView,
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
    });
    return {
      view: haltedView,
    };
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
    selectedPool,
    fundingTokenInput: input,
    onboarding: { step: 3, key: DELEGATION_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: state.view.activity.telemetry },
  });
  return {
    view: completedView,
  };
};
