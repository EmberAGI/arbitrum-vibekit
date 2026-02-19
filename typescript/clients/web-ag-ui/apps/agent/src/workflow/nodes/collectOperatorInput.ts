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

const ONBOARDING: Pick<OnboardingState, 'key' | 'totalSteps'> = {
  totalSteps: 3,
};

export const collectOperatorInputNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  logInfo('collectOperatorInput: entering node', { hasPoolArtifact: !!state.view.poolArtifact });

  if (!state.view.poolArtifact) {
    const failureMessage = 'ERROR: Pool artifact missing before operator input';
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
      'Select a pool to manage, confirm your wallet address, and optionally set an allocation.',
    payloadSchema: z.toJSONSchema(OperatorConfigInputSchema),
    artifactId: state.view.poolArtifact.artifactId,
  };

  const awaitingInput = buildTaskStatus(
    state.view.task,
    'input-required',
    'Awaiting operator configuration to continue setup.',
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
    state.view = { ...state.view, ...pendingView };
    await copilotkitEmitState(config, {
      view: pendingView,
    });
    return new Command({
      update: {
        view: pendingView,
      },
      goto: 'collectOperatorInput',
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

  const parsed = OperatorConfigInputSchema.safeParse(inputToParse);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    const failureMessage = `Invalid operator input: ${issues}`;
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

  const { task, statusEvent } = buildTaskStatus(
    awaitingInput.task,
    'working',
    'Operator configuration received. Preparing funding options.',
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
