import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, isTaskActive, logWarn, type ClmmState, type ClmmUpdate } from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const hireCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const amount = state.settings.amount;
  logWarn('hireCommand: processing hire request', {
    existingTaskState: state.view.task?.taskStatus?.state,
    onboardingStatus: state.view.onboardingFlow?.status,
    onboardingStep: state.view.onboarding?.step,
    onboardingKey: state.view.onboarding?.key,
    hasOperatorInput: Boolean(state.view.operatorInput),
    hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
    hasDelegationBundle: Boolean(state.view.delegationBundle),
    hasOperatorConfig: Boolean(state.view.operatorConfig),
    amount,
  });

  if (state.view.task && isTaskActive(state.view.task.taskStatus.state)) {
    logWarn('hireCommand: task already active, returning existing task', {
      taskId: state.view.task.id,
      taskState: state.view.task.taskStatus.state,
    });
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
  logWarn('hireCommand: created submitted task', {
    taskId: task.id,
    taskState: task.taskStatus.state,
    taskMessage: task.taskStatus.message?.content,
  });
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
