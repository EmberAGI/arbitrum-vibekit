import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskActive, type GMXState, type GMXUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const hireCommandNode = async (
  state: GMXState,
  config: CopilotKitConfig,
): Promise<GMXUpdate> => {
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
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: [] } },
  });

  return {
    view: {
      task,
      command: 'hire',
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
