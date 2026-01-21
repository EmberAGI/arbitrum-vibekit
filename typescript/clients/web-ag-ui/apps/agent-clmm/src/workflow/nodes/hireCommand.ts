import * as copilotkitLanggraph from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskActive, type ClmmState, type ClmmUpdate } from '../context.js';


const { copilotkitEmitState } = copilotkitLanggraph;

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const hireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const amount = state.settings.amount;

  if (state.view.task && isTaskActive(state.view.task.taskStatus.state)) {
    const { task, statusEvent } = buildTaskStatus(
      state.view.task,
      state.view.task.taskStatus.state,
      `Task ${state.view.task.id} is already active.`,
    );
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        task,
        activity: { events: [statusEvent], telemetry: [] },
        command: 'hire',
      },
    };
  }

  const { task, statusEvent } = buildTaskStatus(
    undefined,
    'submitted',
    `Agent hired!${amount ? ` Trading ${amount} tokens...` : ''}`,
  );
  await copilotkitEmitState(config, { view: { task, activity: { events: [statusEvent], telemetry: [] } } });

  return {
    view: {
      task,
      command: 'hire',
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
