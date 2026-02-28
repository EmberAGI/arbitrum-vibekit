import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command, interrupt } from '@langchain/langgraph';
import {
  buildInterruptPauseTransition,
  buildNodeTransition,
  buildStateUpdate,
  requestInterruptPayload,
  shouldPersistInputRequiredCheckpoint,
} from 'agent-workflow-core';
import { z } from 'zod';

import { OperatorConfigInputSchema } from '../../domain/types.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  type OnboardingState,
  type ClmmState,
  type OperatorInterrupt,
  type ClmmUpdate,
} from '../context.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const SETUP_STEP_KEY: OnboardingState['key'] = 'setup';
const FUNDING_STEP_KEY: OnboardingState['key'] = 'funding-token';
const DELEGATION_STEP_KEY: OnboardingState['key'] = 'delegation-signing';

const resolveOperatorResumeOnboarding = (state: ClmmState): OnboardingState | undefined => {
  if (state.thread.operatorConfig || state.thread.onboardingFlow?.status === 'completed') {
    return state.thread.onboarding;
  }
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

export const collectOperatorInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectOperatorInput: entering node', { hasPoolArtifact: !!state.thread.poolArtifact });

  if (state.thread.operatorInput) {
    logInfo('collectOperatorInput: operator input already present; skipping step');
    const resumedOnboarding = resolveOperatorResumeOnboarding(state);
    if (!resumedOnboarding) {
      return buildStateUpdate({});
    }
    const resumedPatch = {
      onboarding: resumedOnboarding,
    };
    applyThreadPatch(state, resumedPatch);
    return buildStateUpdate({
      thread: resumedPatch,
    });
  }

  if (!state.thread.poolArtifact) {
    const failureMessage = 'ERROR: Pool artifact missing before operator input';
    logInfo('collectOperatorInput: missing pool artifact - cannot prompt operator', {
      hasProfilePools: Array.isArray(state.thread.profile?.pools) ? state.thread.profile.pools.length : 0,
      hasAllowedPools: Array.isArray(state.thread.profile?.allowedPools)
        ? state.thread.profile.allowedPools.length
        : 0,
      lifecyclePhase: state.thread.lifecycle?.phase ?? 'prehire',
    });
    const { task, statusEvent } = buildTaskStatus(state.thread.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: [] },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedPatch = {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: [] },
      profile: state.thread.profile,
      metrics: state.thread.metrics,
      transactionHistory: state.thread.transactionHistory,
    };
    applyThreadPatch(state, haltedPatch);
    return buildNodeTransition({
      node: 'summarize',
      update: {
        thread: haltedPatch,
      },
      createCommand: createLangGraphCommand,
    });
  }

  const request: OperatorInterrupt = {
    type: 'operator-config-request',
    message:
      'Select a Camelot pool to manage, confirm wallet, and optional allocation override for this CLMM workflow.',
    payloadSchema: z.toJSONSchema(OperatorConfigInputSchema),
    artifactId: state.thread.poolArtifact.artifactId,
  };

  logInfo('collectOperatorInput: emitting input-required status before interrupt');

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'input-required',
    'Awaiting operator configuration to continue CLMM setup.',
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
    return buildInterruptPauseTransition({
      node: 'collectOperatorInput',
      update: {
        thread: pendingView,
      },
      createCommand: createLangGraphCommand,
    });
  }

  logInfo('collectOperatorInput: calling interrupt() - graph should pause here');
  const interruptResult = await requestInterruptPayload({
    request,
    interrupt,
  });
  const incoming: unknown = interruptResult.raw;
  logInfo('collectOperatorInput: interrupt resolved with input', {
    hasInput: incoming !== undefined,
    incomingType: typeof incoming,
    incoming: typeof incoming === 'string' ? incoming.slice(0, 100) : incoming,
  });

  // CopilotKit's AG-UI protocol passes the response as a JSON string, so parse it first
  const inputToParse = interruptResult.decoded;
  if (inputToParse !== incoming) {
    logInfo('collectOperatorInput: parsed JSON string input', { parsed: inputToParse });
  } else if (typeof incoming === 'string') {
    logInfo('collectOperatorInput: incoming is string but not valid JSON');
  }

  const parsed = OperatorConfigInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid operator input: ${issues}`;
    logInfo('collectOperatorInput: validation failed', { issues, failureMessage });
    const { task, statusEvent } = buildTaskStatus(awaitingInput.task, 'failed', failureMessage);
    const failedView = applyThreadPatch(state, {
      task,
      activity: { events: [statusEvent], telemetry: [] },
    });
    await copilotkitEmitState(config, {
      thread: failedView,
    });
    const haltedPatch = {
      haltReason: failureMessage,
      task,
      activity: { events: [statusEvent], telemetry: [] },
      profile: state.thread.profile,
      metrics: state.thread.metrics,
      transactionHistory: state.thread.transactionHistory,
    };
    applyThreadPatch(state, haltedPatch);
    return buildStateUpdate({
      thread: haltedPatch,
    });
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
  const workingView = applyThreadPatch(state, {
    task,
    activity: { events: [statusEvent], telemetry: [] },
  });
  await copilotkitEmitState(config, {
    thread: workingView,
  });

  const completedPatch = {
    operatorInput: parsed.data,
    onboarding: { step: 2, key: FUNDING_STEP_KEY },
    task,
    activity: { events: [statusEvent], telemetry: [] },
  };
  applyThreadPatch(state, completedPatch);
  return buildStateUpdate({
    thread: completedPatch,
  });
};
