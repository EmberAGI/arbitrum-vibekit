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
  const finalState: TaskState = state.view.haltReason ? 'failed' : 'completed';
  const { task, statusEvent: completion } = buildTaskStatus(
    state.view.task,
    finalState,
    state.view.haltReason ?? 'Mock CLMM workflow completed.',
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
