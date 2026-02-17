import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildSummaryArtifact } from '../artifacts.js';
import {
  buildTaskStatus,
  type ClmmState,
  type ClmmUpdate,
  type TaskState,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const summarizeNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const summaryArtifact = buildSummaryArtifact(state.view.activity.telemetry ?? []);
  let finalState: TaskState;
  let finalMessage: string;

  if (state.view.haltReason) {
    finalState = 'failed';
    finalMessage = state.view.haltReason;
  } else {
    const currentTaskState = state.view.task?.taskStatus?.state;
    const currentTaskMessage = state.view.task?.taskStatus?.message?.content;
    const shouldClearStaleDelegationWait =
      currentTaskState === 'input-required' &&
      Boolean(state.view.operatorConfig) &&
      Boolean(state.view.delegationBundle) &&
      `${currentTaskMessage ?? ''}`.toLowerCase().includes('delegation approval');

    if (shouldClearStaleDelegationWait) {
      finalState = 'working';
      finalMessage = 'Onboarding complete. CLMM strategy is active.';
    } else if (currentTaskState && currentTaskState !== 'working' && currentTaskState !== 'submitted') {
      finalState = currentTaskState;
      finalMessage = currentTaskMessage ?? 'CLMM cycle summarized.';
    } else {
      finalState = 'working';
      finalMessage = 'CLMM cycle summarized.';
    }
  }

  const { task, statusEvent: completion } = buildTaskStatus(
    state.view.task,
    finalState,
    finalMessage,
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [completion] } },
  });
  return {
    view: {
      task,
      activity: {
        telemetry: [],
        events: [
          {
            type: 'artifact',
            artifact: summaryArtifact,
          },
          completion,
        ],
      },
    },
  };
};
