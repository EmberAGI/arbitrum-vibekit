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
  const summaryArtifact = buildSummaryArtifact(state.telemetry ?? []);
  const finalState: TaskState = state.haltReason ? 'failed' : 'completed';
  const { task, statusEvent: completion } = buildTaskStatus(
    state.task,
    finalState,
    state.haltReason ?? 'CLMM workflow completed.',
  );
  await copilotkitEmitState(config, { task, events: [completion] });
  return {
    task,
    events: [
      {
        type: 'artifact',
        artifact: summaryArtifact,
      },
      completion,
    ],
  };
};
