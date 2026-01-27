import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskTerminal, type ClmmState, type ClmmUpdate } from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

export const fireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const currentTask = state.view.task;
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
    await copilotkitEmitState(config, {
      view: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      view: {
        task,
        activity: { events: [statusEvent], telemetry: [] },
        command: 'fire',
      },
    };
  }

  const { task, statusEvent } = buildTaskStatus(currentTask, 'canceled', 'Agent fired! It will stop trading.');
  await copilotkitEmitState(config, { view: { task, activity: { events: [statusEvent], telemetry: [] } } });

  return {
    view: {
      task,
      command: 'fire',
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
