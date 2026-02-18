import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { resolveSummaryTaskStatus } from 'agent-workflow-core';

import { buildSummaryArtifact } from '../artifacts.js';
import {
  buildTaskStatus,
  type ClmmState,
  type ClmmUpdate,
} from '../context.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const summarizeNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate> => {
  const summaryArtifact = buildSummaryArtifact(state.view.activity.telemetry ?? []);
  const currentTaskState = state.view.task?.taskStatus?.state;
  const currentTaskMessage = state.view.task?.taskStatus?.message?.content;
  const shouldClearStaleDelegationWait =
    currentTaskState === 'input-required' &&
    Boolean(state.view.operatorConfig) &&
    Boolean(state.view.delegationBundle) &&
    `${currentTaskMessage ?? ''}`.toLowerCase().includes('delegation approval');
  const { state: finalState, message: finalMessage } = resolveSummaryTaskStatus({
    haltReason: state.view.haltReason,
    currentTaskState,
    currentTaskMessage,
    staleDelegationWaitCleared: shouldClearStaleDelegationWait,
    activeSummaryMessage: 'CLMM cycle summarized.',
    onboardingCompleteMessage: 'Onboarding complete. CLMM strategy is active.',
  });

  const { task, statusEvent: completion } = buildTaskStatus(
    state.view.task,
    finalState,
    finalMessage,
  );
  await copilotkitEmitState(config, {
    view: { task, activity: { events: [completion] } },
  });
  return {
    view: {
      task,
      activity: {
        telemetry: [],
        events: [
          {
            type: 'artifact',
            artifact: summaryArtifact,
          },
          completion,
        ],
      },
    },
  };
};
