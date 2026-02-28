import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { requestInterruptPayload, shouldPersistInputRequiredCheckpoint } from 'agent-workflow-core';
import { z } from 'zod';

import { FundingTokenInputSchema, type FundingTokenInput } from '../../domain/types.js';
import {
  applyThreadPatch,
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
    hasOperatorInput: Boolean(state.thread.operatorInput),
    onboardingStep: state.thread.onboarding?.step,
  });

  const operatorInput = state.thread.operatorInput;
  if (!operatorInput) {
    logInfo('collectFundingTokenInput: operator input missing; rerouting to collectOperatorInput');
    return new Command({ goto: 'collectOperatorInput' });
  }

  const selectedPool =
    state.thread.profile.allowedPools?.find(
      (pool) => pool.address.toLowerCase() === operatorInput.poolAddress.toLowerCase(),
    ) ?? state.thread.profile.pools?.[0];

  if (!selectedPool) {
    const failureMessage = `ERROR: Pool ${operatorInput.poolAddress} not available for funding step`;
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: [] },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedView = applyThreadPatch(state, {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: [] },
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

  if (state.thread.delegationsBypassActive === true) {
    logInfo('collectFundingTokenInput: bypass active; skipping step');
    return {
      thread: {
        selectedPool,
        fundingTokenInput: state.thread.fundingTokenInput,
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
    state.thread.task,
    'input-required',
    'Awaiting funding-token selection to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: state.thread.activity.telemetry },
    selectedPool,
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
    });
    return {
      thread: haltedView,
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
    selectedPool,
    fundingTokenInput: input,
    onboarding: { step: 3, key: DELEGATION_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: state.thread.activity.telemetry },
  });
  return {
    thread: completedView,
  };
};
