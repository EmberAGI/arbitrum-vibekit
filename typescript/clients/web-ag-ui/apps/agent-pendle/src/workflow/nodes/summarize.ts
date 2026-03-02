import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { resolveOnboardingPhase, resolveSummaryTaskStatus } from 'agent-workflow-core';

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
  const summaryArtifact = buildSummaryArtifact(state.thread.activity.telemetry ?? []);
  const onboardingPhase = resolveOnboardingPhase({
    hasSetupInput: Boolean(state.thread.operatorInput),
    hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
    requiresDelegationSigning: state.thread.delegationsBypassActive !== true,
    hasDelegationBundle: Boolean(state.thread.delegationBundle),
    hasOperatorConfig: Boolean(state.thread.operatorConfig),
    requiresSetupComplete: true,
    setupComplete: state.thread.setupComplete === true,
  });
  const currentTaskState = state.thread.task?.taskStatus?.state;
  const currentTaskMessage = state.thread.task?.taskStatus?.message?.content;
  const shouldClearStaleDelegationWait =
    currentTaskState === 'input-required' &&
    state.thread.setupComplete === true &&
    Boolean(state.thread.delegationBundle) &&
    `${currentTaskMessage ?? ''}`.toLowerCase().includes('delegation approval');
  const { state: finalState, message: finalMessage } = resolveSummaryTaskStatus({
    haltReason: state.thread.haltReason,
    currentTaskState,
    currentTaskMessage,
    staleDelegationWaitCleared: shouldClearStaleDelegationWait,
    onboardingComplete: onboardingPhase === 'ready',
    activeSummaryMessage: 'Pendle cycle summarized.',
    onboardingCompleteMessage: 'Onboarding complete. Pendle strategy is active.',
  });
  const { task, statusEvent: completion } = buildTaskStatus(
    state.thread.task,
    finalState,
    finalMessage,
  );
  await copilotkitEmitState(config, {
    thread: { task, activity: { events: [completion] } },
  });
  return {
    thread: {
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
