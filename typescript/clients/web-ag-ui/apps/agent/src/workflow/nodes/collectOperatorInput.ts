import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { Command, interrupt } from '@langchain/langgraph';
import { requestInterruptPayload, shouldPersistInputRequiredCheckpoint } from 'agent-workflow-core';
import { z } from 'zod';

import { OperatorConfigInputSchema } from '../../domain/types.js';
import {
  applyThreadPatch,
  buildTaskStatus,
  logInfo,
  type ClmmState,
  type OperatorInterrupt,
  type ClmmUpdate,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

const SETUP_STEP_KEY = 'setup' as const;
const FUNDING_STEP_KEY = 'funding-token' as const;

export const collectOperatorInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectOperatorInput: entering node', { hasPoolArtifact: !!state.thread.poolArtifact });

  if (!state.thread.poolArtifact) {
    const failureMessage = 'ERROR: Pool artifact missing before operator input';
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

  const request: OperatorInterrupt = {
    type: 'operator-config-request',
    message:
      'Select a pool to manage, confirm your wallet address, and optionally set an allocation.',
    payloadSchema: z.toJSONSchema(OperatorConfigInputSchema),
    artifactId: state.thread.poolArtifact.artifactId,
  };

  const awaitingInput = buildTaskStatus(
    state.thread.task,
    'input-required',
    'Awaiting operator configuration to continue setup.',
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
    return new Command({
      update: {
        thread: mergedView,
      },
      goto: 'collectOperatorInput',
    });
  }

  const interruptResult = await requestInterruptPayload({
    request,
    interrupt,
  });
  const parsed = OperatorConfigInputSchema.safeParse(interruptResult.decoded);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid operator input: ${issues}`;
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

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Operator configuration received. Preparing funding options.',
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
