import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskActive, type ClmmState, type ClmmUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const hireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const amount = state.settings.amount;

  if (state.thread.task && isTaskActive(state.thread.task.taskStatus.state)) {
    const { task, statusEvent } = buildTaskStatus(
      state.thread.task,
      state.thread.task.taskStatus.state,
      `Task ${state.thread.task.id} is already active.`,
    );
    await copilotkitEmitState(config, {
      thread: { task, activity: { events: [statusEvent], telemetry: [] } },
    });
    return {
      thread: {
        task,
        activity: { events: [statusEvent], telemetry: [] },
        lifecycle: { phase: 'onboarding' },
      },
    };
  }

  const { task, statusEvent } = buildTaskStatus(
    undefined,
    'submitted',
    `Agent hired!${amount ? ` Trading ${amount} tokens...` : ''}`,
  );
  await copilotkitEmitState(config, { thread: { task, activity: { events: [statusEvent], telemetry: [] } } });

  return {
    thread: {
      task,
      lifecycle: { phase: 'onboarding' },
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
