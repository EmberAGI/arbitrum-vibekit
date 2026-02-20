import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import { GmxSetupInputSchema } from '../../domain/types.js';
import {
  applyViewPatch,
  buildTaskStatus,
  logInfo,
  type OnboardingState,
  type ClmmState,
  type GmxSetupInterrupt,
  type ClmmUpdate,
} from '../context.js';

const SETUP_STEP_KEY: OnboardingState['key'] = 'setup';
const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const resolveSetupResumeOnboarding = (state: ClmmState): OnboardingState => {
  if (!state.view.fundingTokenInput) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  if (state.view.delegationsBypassActive === true) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  return state.view.onboarding?.key === FUNDING_STEP_KEY
    ? { step: 3, key: DELEGATION_STEP_KEY }
    : { step: 2, key: DELEGATION_STEP_KEY };
};

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const collectSetupInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectSetupInput: entering node');

  if (state.view.operatorInput) {
    logInfo('collectSetupInput: setup input already present; skipping step');
    const resumedView = applyViewPatch(state, {
      onboarding: resolveSetupResumeOnboarding(state),
    });
    return {
      view: resumedView,
    };
  }

  const request: GmxSetupInterrupt = {
    type: 'gmx-setup-request',
    message: 'Select the GMX market and enter the USDC allocation for low-leverage trades.',
    payloadSchema: z.toJSONSchema(GmxSetupInputSchema),
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Awaiting market + allocation to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: { step: 1, key: SETUP_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: [] },
  };
  const currentTaskState = state.view.task?.taskStatus?.state;
  const currentTaskMessage = state.view.task?.taskStatus?.message?.content;
  const shouldPersistPendingState =
    currentTaskState !== 'input-required' || currentTaskMessage !== awaitingMessage;
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
      goto: 'collectSetupInput',
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

  const parsed = GmxSetupInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid setup input: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
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
    return {
      view: haltedView,
    };
  }

  const normalized =
    'usdcAllocation' in parsed.data
      ? parsed.data
      : {
          walletAddress: parsed.data.walletAddress,
          usdcAllocation: parsed.data.baseContributionUsd,
          targetMarket: parsed.data.targetMarket,
        };

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Market and USDC allocation received. Preparing funding token options.',
  );
  const workingView = applyViewPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: [] },
  });
  await copilotkitEmitState(config, {
    view: workingView,
  });

  const completedView = applyViewPatch(state, {
    operatorInput: normalized,
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: [] },
  });
  return {
    view: completedView,
  };
};
