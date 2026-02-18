import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { z } from 'zod';

import { OperatorConfigInputSchema } from '../../domain/types.js';
import {
  buildTaskStatus,
  logInfo,
  type OnboardingState,
  type ClmmState,
  type OperatorInterrupt,
  type ClmmUpdate,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const FULL_ONBOARDING_TOTAL_STEPS = 3;
const REDUCED_ONBOARDING_TOTAL_STEPS = 2;

const resolveOnboardingTotalSteps = (state: ClmmState): number =>
  state.view.delegationsBypassActive === true
    ? REDUCED_ONBOARDING_TOTAL_STEPS
    : FULL_ONBOARDING_TOTAL_STEPS;

const buildOnboarding = (state: ClmmState, step: number): OnboardingState => ({
  step,
  totalSteps: resolveOnboardingTotalSteps(state),
});

const resolveOperatorResumeStep = (state: ClmmState): number => {
  const configuredTotalSteps = state.view.onboarding?.totalSteps;
  const totalSteps =
    typeof configuredTotalSteps === 'number' && configuredTotalSteps > 0
      ? configuredTotalSteps
      : resolveOnboardingTotalSteps(state);
  return state.view.fundingTokenInput ? (totalSteps <= 2 ? 2 : 3) : 2;
};

export const collectOperatorInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectOperatorInput: entering node', { hasPoolArtifact: !!state.view.poolArtifact });

  if (state.view.operatorInput) {
    logInfo('collectOperatorInput: operator input already present; skipping step');
    return {
      view: {
        onboarding: buildOnboarding(state, resolveOperatorResumeStep(state)),
      },
    };
  }

  if (!state.view.poolArtifact) {
    const failureMessage = 'ERROR: Pool artifact missing before operator input';
    logInfo('collectOperatorInput: missing pool artifact - cannot prompt operator', {
      hasProfilePools: Array.isArray(state.view.profile?.pools) ? state.view.profile.pools.length : 0,
      hasAllowedPools: Array.isArray(state.view.profile?.allowedPools)
        ? state.view.profile.allowedPools.length
        : 0,
      command: state.view.command,
    });
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

  const request: OperatorInterrupt = {
    type: 'operator-config-request',
    message:
      'Select a Camelot pool to manage, confirm wallet, and optional allocation override for this CLMM workflow.',
    payloadSchema: z.toJSONSchema(OperatorConfigInputSchema),
    artifactId: state.view.poolArtifact.artifactId,
  };

  logInfo('collectOperatorInput: emitting input-required status before interrupt');

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Awaiting operator configuration to continue CLMM setup.',
  );
  const awaitingMessage = awaitingInput.task.taskStatus.message?.content;
  const pendingView = {
    onboarding: buildOnboarding(state, 1),
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
      goto: 'collectOperatorInput',
    });
  }

  logInfo('collectOperatorInput: calling interrupt() - graph should pause here');
  const incoming: unknown = await interrupt(request);
  logInfo('collectOperatorInput: interrupt resolved with input', {
    hasInput: incoming !== undefined,
    incomingType: typeof incoming,
    incoming: typeof incoming === 'string' ? incoming.slice(0, 100) : incoming,
  });

  // CopilotKit's AG-UI protocol passes the response as a JSON string, so parse it first
  let inputToParse: unknown = incoming;
  if (typeof incoming === 'string') {
    try {
      inputToParse = JSON.parse(incoming);
      logInfo('collectOperatorInput: parsed JSON string input', { parsed: inputToParse });
    } catch {
      logInfo('collectOperatorInput: incoming is string but not valid JSON');
    }
  }

  const parsed = OperatorConfigInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid operator input: ${issues}`;
    logInfo('collectOperatorInput: validation failed', { issues, failureMessage });
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        haltReason: failureMessage,
        task,
        activity: { events: [statusEvent], telemetry: [] },
        profile: state.view.profile,
        metrics: state.view.metrics,
        transactionHistory: state.view.transactionHistory,
      },
    };
  }

  logInfo('Operator input received', {
    poolAddress: parsed.data.poolAddress,
    walletAddress: parsed.data.walletAddress,
  });

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Operator configuration received. Preparing execution context.',
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: [] } },
  });

  return {
    view: {
      operatorInput: parsed.data,
      onboarding: buildOnboarding(state, 2),
      task,
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
