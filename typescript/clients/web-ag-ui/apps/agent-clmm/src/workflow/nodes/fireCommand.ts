import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskTerminal, type ClmmState, type ClmmUpdate } from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';

type Configurable = { configurable?: { thread_id?: string } };

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const fireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const currentTask = state.task;
  const threadId = (config as Configurable).configurable?.thread_id;
  if (threadId) {
    cancelCronForThread(threadId);
  }

  if (currentTask && isTaskTerminal(currentTask.taskStatus.state)) {
    const { task, statusEvent } = buildTaskStatus(
      currentTask,
      currentTask.taskStatus.state,
      `Task ${currentTask.id} is already in a terminal state.`,
    );
    await copilotkitEmitState(config, { task, events: [statusEvent] });
    return {
      task,
      events: [statusEvent],
      command: 'fire',
    };
  }

  const { task, statusEvent } = buildTaskStatus(currentTask, 'canceled', 'Agent fired! It will stop trading.');
  await copilotkitEmitState(config, { task, events: [statusEvent] });

  return {
    task,
    command: 'fire',
    events: [statusEvent],
  };
};
