import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import { PendleSetupInputSchema } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  type OnboardingState,
  type ClmmState,
  type PendleSetupInterrupt,
  type ClmmUpdate,
} from '../context.js';

const FULL_ONBOARDING_TOTAL_STEPS = 3;

const ONBOARDING: Pick<OnboardingState, 'key' | 'totalSteps'> = {
  totalSteps: FULL_ONBOARDING_TOTAL_STEPS,
};

const resolveResumeOnboarding = (state: ClmmState): OnboardingState => {
  const configuredTotalSteps = state.view.onboarding?.totalSteps;
  const totalSteps =
    typeof configuredTotalSteps === 'number' && configuredTotalSteps > 0
      ? configuredTotalSteps
      : FULL_ONBOARDING_TOTAL_STEPS;
  const step = state.view.fundingTokenInput ? (totalSteps <= 2 ? 2 : 3) : 2;
  return { ...ONBOARDING, step, totalSteps };
};

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const collectSetupInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectSetupInput: entering node');

  if (state.view.operatorInput) {
    logInfo('collectSetupInput: operator input already present; skipping step');
    return {
      view: {
        onboarding: resolveResumeOnboarding(state),
      },
    };
  }

  const request: PendleSetupInterrupt = {
    type: 'pendle-setup-request',
    message:
      'Enter the amount to deploy. If your wallet already has a Pendle PT position, the agent will manage that position; otherwise it will auto-select the highest-yield YT market.',
    payloadSchema: z.toJSONSchema(PendleSetupInputSchema),
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Awaiting funding amount to continue onboarding.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: { ...ONBOARDING, step: 1 },
    task: awaitingInput.task,
    activity: { events: [awaitingInput.statusEvent], telemetry: [] },
  };
  const currentTaskState = state.view.task?.taskStatus?.state;
  const currentTaskMessage = state.view.task?.taskStatus?.message?.content;
  const shouldPersistPendingState =
    currentTaskState !== 'input-required' || currentTaskMessage !== awaitingMessage;
  const hasRunnableConfig = Boolean((config as { configurable?: unknown }).configurable);
  if (hasRunnableConfig && shouldPersistPendingState) {
    const mergedView = { ...state.view, ...pendingView };
    state.view = mergedView;
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

  const parsed = PendleSetupInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid setup input: ${issues}`;
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
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

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Funding amount received. Preparing funding token options.',
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: [] } },
  });

  return {
    view: {
      operatorInput: parsed.data,
      onboarding: { ...ONBOARDING, step: 2 },
      task,
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
