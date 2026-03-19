import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { interrupt } from '@langchain/langgraph';
import type { Command } from '@langchain/langgraph';
import {
  buildNodeTransition,
  requestInterruptPayload,
  shouldPersistInputRequiredCheckpoint,
} from 'agent-runtime-contracts';
import { z } from 'zod';

import { PendleSetupInputSchema } from '../../domain/types.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  type OnboardingState,
  type ClmmState,
  type PendleSetupInterrupt,
  type ClmmUpdate,
} from '../context.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';

const SETUP_STEP_KEY: OnboardingState['key'] = 'funding-amount';
const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const resolveResumeOnboarding = (state: ClmmState): OnboardingState | undefined => {
  if (
    state.thread.setupComplete === true ||
    state.thread.operatorConfig ||
    state.thread.onboardingFlow?.status === 'completed'
  ) {
    return state.thread.onboarding;
  }
  if (!state.thread.fundingTokenInput) {
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

  if (state.thread.operatorInput) {
    logInfo('collectSetupInput: operator input already present; skipping step');
    const resumedOnboarding = resolveResumeOnboarding(state);
    if (!resumedOnboarding) {
      return {};
    }
    const resumedView = applyThreadPatch(state, {
      onboarding: resumedOnboarding,
    });
    return {
      thread: resumedView,
    };
  }

  const request: PendleSetupInterrupt = {
    type: 'pendle-setup-request',
    message:
      'Enter the amount to deploy. If your wallet already has a Pendle PT position, the agent will manage that position; otherwise it will auto-select the highest-yield YT market.',
    payloadSchema: z.toJSONSchema(PendleSetupInputSchema),
  };

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'input-required',
    'Awaiting funding amount to continue onboarding.',
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
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = applyThreadPatch(state, pendingView);
    await copilotkitEmitState(config, {
      thread: mergedView,
    });
    return buildNodeTransition({
      node: 'collectSetupInput',
      update: {
        thread: pendingView,
      },
      createCommand: createLangGraphCommand,
    });
  }

  const interruptResult = await requestInterruptPayload({
    request,
    interrupt,
  });
  const parsed = PendleSetupInputSchema.safeParse(interruptResult.decoded);
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
    return buildNodeTransition({
      node: 'summarize',
      update: {
        thread: haltedView,
      },
      createCommand: createLangGraphCommand,
    });
  }

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Funding amount received. Preparing funding token options.',
  );
  const workingView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: [] },
  });
  await copilotkitEmitState(config, {
    thread: workingView,
  });

  const completedView = applyThreadPatch(state, {
    operatorInput: parsed.data,
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: [] },
  });
  return {
    thread: completedView,
  };
};
