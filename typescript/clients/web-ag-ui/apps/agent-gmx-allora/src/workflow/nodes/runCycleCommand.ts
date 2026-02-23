import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';

import { buildTaskStatus, logInfo, type ClmmState, type ClmmUpdate } from '../context.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const runCycleCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const nextOnboardingNode = resolveNextOnboardingNode(state);
  if (nextOnboardingNode !== 'syncState') {
    logInfo('runCycleCommand: onboarding incomplete; deferring cycle run', {
      nextOnboardingNode,
      hasOperatorConfig: Boolean(state.view.operatorConfig),
      hasSelectedPool: Boolean(state.view.selectedPool),
      hasFundingTokenInput: Boolean(state.view.fundingTokenInput),
      hasDelegationBundle: Boolean(state.view.delegationBundle),
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

  return {
    view: {
      task,
      command: 'cycle',
      activity: { events: [statusEvent], telemetry: [] },
    },
  };
};
