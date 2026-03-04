import { resolveSummaryTaskStatus } from 'agent-workflow-core';

import { buildSummaryArtifact } from '../artifacts.js';
import {
  buildTaskStatus,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';
import { copilotkitEmitState } from '../emitState.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const summarizeNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const summaryArtifact = buildSummaryArtifact(state.thread.activity.telemetry ?? []);
  const currentTaskState = state.thread.task?.taskStatus?.state;
  const currentTaskMessage = state.thread.task?.taskStatus?.message?.content;
  const onboardingComplete = resolveNextOnboardingNode(state) === 'syncState';
  const activeSummaryMessage =
    currentTaskState === 'working' && typeof currentTaskMessage === 'string' && currentTaskMessage.length > 0
      ? currentTaskMessage
      : 'CLMM cycle summarized.';
  const { state: finalState, message: finalMessage } = resolveSummaryTaskStatus({
    haltReason: state.thread.haltReason,
    currentTaskState,
    currentTaskMessage,
    onboardingComplete,
    activeSummaryMessage,
    onboardingCompleteMessage: 'Onboarding complete. CLMM strategy is active.',
  });
  const artifactEvent = {
    type: 'artifact' as const,
    artifact: summaryArtifact,
  };
  const canReuseTask =
    state.thread.task !== undefined &&
    currentTaskState === finalState &&
    currentTaskMessage === finalMessage;

  if (canReuseTask) {
    await copilotkitEmitState(config, {
      thread: {
        task: state.thread.task,
        activity: { events: [artifactEvent] },
      },
    });
    return {
      thread: {
        task: state.thread.task,
        activity: {
          telemetry: [],
          events: [artifactEvent],
        },
      },
    };
  }

  const { task, statusEvent: completion } = buildTaskStatus(
    state.thread.task,
    finalState,
    finalMessage,
  );
  await copilotkitEmitState(config, {
    thread: { task, activity: { events: [completion] } },
  });
  return {
    thread: {
      task,
      activity: {
        telemetry: [],
        events: [
          artifactEvent,
          completion,
        ],
      },
    },
  };
};
