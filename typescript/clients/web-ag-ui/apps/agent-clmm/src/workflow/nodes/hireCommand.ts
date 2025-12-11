import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskActive, type ClmmState, type ClmmUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const hireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const amount = state.amount;

  if (state.task && isTaskActive(state.task.taskStatus.state)) {
    const { task, statusEvent } = buildTaskStatus(
      state.task,
      state.task.taskStatus.state,
      `Task ${state.task.id} is already active.`,
    );
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return {
      task,
      events: [statusEvent],
      command: 'hire',
    };
  }

  const { task, statusEvent } = buildTaskStatus(
    undefined,
    'submitted',
    `Agent hired!${amount ? ` Trading ${amount} tokens...` : ''}`,
  );
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  return {
    task,
    command: 'hire',
    events: [statusEvent],
  };
};
