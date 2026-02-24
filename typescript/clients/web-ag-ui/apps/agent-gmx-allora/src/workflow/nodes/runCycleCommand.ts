import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, logInfo, logWarn, type ClmmState, type ClmmUpdate } from '../context.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];
type Configurable = {
  configurable?: {
    thread_id?: string;
    checkpoint_id?: string;
    checkpoint_ns?: string;
  };
};

export const runCycleCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const runtimeConfig = (config as Configurable).configurable;
  const threadId = runtimeConfig?.thread_id;
  const checkpointId = runtimeConfig?.checkpoint_id;
  const checkpointNamespace = runtimeConfig?.checkpoint_ns;
  logWarn('runCycleCommand: processing cycle command', {
    threadId,
    checkpointId,
    checkpointNamespace,
    onboardingStatus: state.view.onboardingFlow?.status,
    onboardingStep: state.view.onboarding?.step,
    onboardingKey: state.view.onboarding?.key,
    taskState: state.view.task?.taskStatus?.state,
    hasOperatorConfig: Boolean(state.view.operatorConfig),
    hasSelectedPool: Boolean(state.view.selectedPool),
  });
  const nextOnboardingNode = resolveNextOnboardingNode(state);
  if (nextOnboardingNode !== 'syncState') {
    logInfo('runCycleCommand: onboarding incomplete; deferring cycle run', {
      nextOnboardingNode,
      hasOperatorConfig: Boolean(state.view.operatorConfig),
      hasSelectedPool: Boolean(state.view.selectedPool),
      hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
      hasDelegationBundle: Boolean(state.view.delegationBundle),
    });
    logWarn('runCycleCommand: rerouting cycle because onboarding incomplete', {
      threadId,
      checkpointId,
      checkpointNamespace,
      nextOnboardingNode,
      taskState: state.view.task?.taskStatus?.state,
      taskMessage: state.view.task?.taskStatus?.message?.content,
    });
    return {};
  }

  const { task, statusEvent } = buildTaskStatus(
    state.view.task,
    'working',
    'Running scheduled GMX Allora cycle.',
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [statusEvent], telemetry: [] } },
  });
  logWarn('runCycleCommand: cycle task submitted for poll execution', {
    threadId,
    checkpointId,
    checkpointNamespace,
    taskId: task.id,
    taskState: task.taskStatus.state,
  });

  return {
    view: {
      task,
      command: 'cycle',
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
