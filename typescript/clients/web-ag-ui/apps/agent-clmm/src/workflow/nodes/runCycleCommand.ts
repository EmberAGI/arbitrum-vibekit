import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, type ClmmState, type ClmmUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const runCycleCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const { task, statusEvent } = buildTaskStatus(
    state.task,
    'working',
    'Running scheduled CLMM cycle.',
  );
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  return {
    task,
    command: 'cycle',
    events: [statusEvent],
  };
};
