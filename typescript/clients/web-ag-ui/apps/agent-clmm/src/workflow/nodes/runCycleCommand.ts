import { type Command } from '@langchain/langgraph';
import { buildNodeTransition } from 'agent-workflow-core';

import { buildTaskStatus, logInfo, type ClmmState, type ClmmUpdate } from '../context.js';
import { copilotkitEmitState } from '../emitState.js';
import { createLangGraphCommand } from '../langGraphCommandFactory.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';
import { buildLoggedStateUpdate } from '../stateUpdateFactory.js';

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

  if (state.thread.task?.taskStatus?.state === 'working') {
    return buildLoggedStateUpdate('runCycleCommandNode', {
      thread: {
        lifecycle: { phase: 'active' as const },
      },
    });
  }

  const { task, statusEvent } = buildTaskStatus(
    state.thread.task,
    'working',
    'Running scheduled CLMM cycle.',
  );
  await copilotkitEmitState(config, { thread: { task, activity: { events: [statusEvent], telemetry: [] } } });

  return buildLoggedStateUpdate('runCycleCommandNode', {
    thread: {
      task,
      lifecycle: { phase: 'active' as const },
      activity: { events: [statusEvent], telemetry: [] },
    },
  });
};
