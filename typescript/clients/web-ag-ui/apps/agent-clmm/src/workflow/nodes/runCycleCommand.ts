import { copilotkitEmitState } from '@copilotkit/sdk-js/langgraph';
import { type Command } from '@langchain/langgraph';
import { buildNodeTransition, buildStateUpdate } from 'agent-workflow-core';

import { buildTaskStatus, logInfo, type ClmmState, type ClmmUpdate } from '../context.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';

type CopilotKitConfig = Parameters<typeof copilotkitEmitState>[0];

export const runCycleCommandNode = async (
  state: ClmmState,
  config: CopilotKitConfig,
): Promise<ClmmUpdate | Command<string, ClmmUpdate>> => {
  const nextOnboardingNode = resolveNextOnboardingNode(state);
  if (nextOnboardingNode !== 'syncState') {
    logInfo('runCycleCommand: onboarding incomplete; deferring cycle run', {
      nextOnboardingNode,
      hasOperatorConfig: Boolean(state.thread.operatorConfig),
      hasSelectedPool: Boolean(state.thread.selectedPool),
      hasFundingTokenInput: Boolean(state.thread.fundingTokenInput),
      hasDelegationBundle: Boolean(state.thread.delegationBundle),
    });
    return buildNodeTransition({
      node: nextOnboardingNode,
      createCommand: createLangGraphCommand,
    });
  }

  const { task, statusEvent } = buildTaskStatus(
    state.thread.task,
    'working',
    'Running scheduled CLMM cycle.',
  );
  await copilotkitEmitState(config, { thread: { task, activity: { events: [statusEvent], telemetry: [] } } });

  return buildStateUpdate({
    thread: {
      task,
      lifecycle: { phase: 'active' as const },
      activity: { events: [statusEvent], telemetry: [] },
    },
  });
};
