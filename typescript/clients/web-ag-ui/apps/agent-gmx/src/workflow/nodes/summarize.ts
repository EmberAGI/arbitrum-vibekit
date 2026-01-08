import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

// import { buildSummaryArtifact } from '../artifacts.js';

import {
  buildTaskStatus,
  logInfo,
  type GMXState,
  type GMXUpdate,
  type TaskState,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const summarizeNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<GMXUpdate> => {
  //   const summaryArtifact = buildSummaryArtifact(state.view.activity.telemetry ?? []);
  logInfo(`Inside Summarize Node.`);
  logInfo(`GMX workflow completed...`);
  const finalState: TaskState = state.view.haltReason ? 'failed' : 'completed';
  const { task, statusEvent: completion } = buildTaskStatus(
    state.view.task,
    finalState,
    state.view.haltReason ?? 'GMX workflow completed.',
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [completion] } },
  });
  return {
    view: {
      task,
      activity: {
        telemetry: [],
        events: [completion],
      },
    },
  };
};
