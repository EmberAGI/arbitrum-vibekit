import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { interrupt, type Command } from '@langchain/langgraph';
import {
  buildInterruptPauseTransition,
  requestInterruptPayload,
  shouldPersistInputRequiredCheckpoint,
} from 'agent-workflow-core';
import { z } from 'zod';

import { GmxSetupInputSchema } from '../../domain/types.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  logWarn,
  logPauseSnapshot,
  type OnboardingState,
  type ClmmState,
  type GmxSetupInterrupt,
  type ClmmUpdate,
} from '../context.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';

const SETUP_STEP_KEY: OnboardingState['key'] = 'setup';
const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const resolveSetupResumeOnboarding = (state: ClmmState): OnboardingState => {
  if (!state.thread.fundingTokenInput) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  if (state.thread.delegationsBypassActive === true) {
    return { step: 2, key: FUNDING_STEP_KEY };
  }
  return state.thread.onboarding?.key === FUNDING_STEP_KEY
    ? { step: 3, key: DELEGATION_STEP_KEY }
    : { step: 2, key: DELEGATION_STEP_KEY };
};

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const collectSetupInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectSetupInput: entering node');
  logWarn('collectSetupInput: node entered', {
    hasOperatorInput: Boolean(state.thread.operatorInput),
    onboardingStatus: state.thread.onboardingFlow?.status,
    onboardingStep: state.thread.onboarding?.step,
    onboardingKey: state.thread.onboarding?.key,
  });

  if (state.thread.operatorInput) {
    logInfo('collectSetupInput: setup input already present; skipping step');
    logWarn('collectSetupInput: setup already present; skipping interrupt', {
      walletAddress: state.thread.operatorInput.walletAddress,
      targetMarket: state.thread.operatorInput.targetMarket,
      usdcAllocation: state.thread.operatorInput.usdcAllocation,
    });
    const resumedView = applyThreadPatch(state, {
      onboarding: resolveSetupResumeOnboarding(state),
    });
    return {
      thread: resumedView,
    };
  }

  const request: GmxSetupInterrupt = {
    type: 'gmx-setup-request',
    message: 'Select the GMX market and enter the USDC allocation for low-leverage trades.',
    payloadSchema: z.toJSONSchema(GmxSetupInputSchema),
  };

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'input-required',
    'Awaiting market + allocation to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: { step: 1, key: SETUP_STEP_KEY },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: [] },
  };
  const shouldPersistPendingState = shouldPersistInputRequiredCheckpoint({
    currentTaskState: state.thread.task?.taskStatus?.state,
    currentTaskMessage: state.thread.task?.taskStatus?.message?.content,
    currentOnboardingKey: state.thread.onboarding?.key,
    nextOnboardingKey: pendingView.onboarding.key,
    nextTaskMessage: awaitingMessage,
  });
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  const pauseSnapshotView = applyThreadPatch(state, pendingView);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = pauseSnapshotView;
    logPauseSnapshot({
      node: 'collectSetupInput',
      reason: 'awaiting setup input',
      thread: mergedView,
      metadata: {
        pauseMechanism: 'checkpoint-and-interrupt',
      },
    });
    await copilotkitEmitState(config, {
      thread: mergedView,
    });
    return buildInterruptPauseTransition({
      node: 'collectSetupInput',
      update: {
        thread: mergedView,
      },
      createCommand: createLangGraphCommand,
    });
  }
  logPauseSnapshot({
    node: 'collectSetupInput',
    reason: 'awaiting setup input',
    thread: pauseSnapshotView,
    metadata: {
      pauseMechanism: 'interrupt',
    },
  });

  const interruptResult = await requestInterruptPayload({
    request,
    interrupt,
  });
  const parsed = GmxSetupInputSchema.safeParse(interruptResult.decoded);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid setup input: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
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
    return {
      thread: haltedView,
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
  const workingView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: [] },
  });
  await copilotkitEmitState(config, {
    thread: workingView,
  });

  const completedView = applyThreadPatch(state, {
    operatorInput: normalized,
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: [] },
  });
  return {
    thread: completedView,
  };
};
