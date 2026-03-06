import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskActive, logWarn, type ClmmState, type ClmmUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const hireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const amount = state.settings.amount;
  logWarn('hireCommand: processing hire request', {
    existingTaskState: state.thread.task?.taskStatus?.state,
    onboardingStatus: state.thread.onboardingFlow?.status,
    onboardingStep: state.thread.onboarding?.step,
    onboardingKey: state.thread.onboarding?.key,
    hasOperatorInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
    hasOperatorConfig: Boolean(state.thread.operatorConfig),
    amount,
  });

  if (state.thread.task && isTaskActive(state.thread.task.taskStatus.state)) {
    logWarn('hireCommand: task already active, returning existing task', {
      taskId: state.thread.task.id,
      taskState: state.thread.task.taskStatus.state,
    });
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
  logWarn('hireCommand: created submitted task', {
    taskId: task.id,
    taskState: task.taskStatus.state,
    taskMessage: task.taskStatus.message?.content,
  });
  await copilotkitEmitState(config, {
    thread: { task, activity: { events: [statusEvent], telemetry: [] } },
  });

  return {
    thread: {
      task,
      lifecycle: { phase: 'onboarding' },
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
