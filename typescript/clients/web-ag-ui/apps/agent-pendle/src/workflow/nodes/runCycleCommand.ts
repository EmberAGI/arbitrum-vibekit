import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, type ClmmState, type ClmmUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const runCycleCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const { task, statusEvent } = buildTaskStatus(
    state.thread.task,
    'working',
    'Running scheduled Pendle cycle.',
  );
  await copilotkitEmitState(config, { thread: { task, activity: { events: [statusEvent], telemetry: [] } } });

  return {
    thread: {
      task,
      lifecycle: { phase: 'active' },
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
