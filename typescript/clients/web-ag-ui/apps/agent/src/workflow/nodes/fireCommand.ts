import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskTerminal, type ClmmState, type ClmmUpdate } from '../context.js';
import { cancelCronForThread } from '../cronScheduler.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = { configurable?: { thread_id?: string } };

export const fireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const currentTask = state.thread.task;
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
      thread: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      thread: {
        task,
        activity: { events: [statusEvent], telemetry: [] },
        lifecycle: { phase: 'inactive' },
      },
    };
  }

  const onboardingComplete = Boolean(state.thread.operatorConfig);
  const terminalState = onboardingComplete ? 'completed' : 'canceled';
  const terminalMessage = onboardingComplete
    ? 'Agent fired. Workflow completed.'
    : 'Agent fired before onboarding completed.';
  const { task, statusEvent } = buildTaskStatus(currentTask, terminalState, terminalMessage);
  await copilotkitEmitState(config, { thread: { task, activity: { events: [statusEvent], telemetry: [] } } });

  return {
    thread: {
      task,
      lifecycle: { phase: 'inactive' },
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
