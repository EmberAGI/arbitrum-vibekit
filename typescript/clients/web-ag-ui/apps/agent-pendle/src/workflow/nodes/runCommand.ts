import {
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  mapOnboardingPhaseToTarget,
  resolveOnboardingPhase,
  resolveCommandTargetForBootstrappedFlow,
  type AgentCommand,
  type CommandEnvelope,
  type CommandRoutingTarget,
} from 'agent-workflow-core';

import { type ClmmState } from '../context.js';

type CommandTarget =
  | CommandRoutingTarget
  | 'collectSetupInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator';

export function extractCommandEnvelope(messages: ClmmState['messages']): CommandEnvelope | null {
  return extractCommandEnvelopeFromMessages(messages);
}

export function extractCommand(messages: ClmmState['messages']): AgentCommand | null {
  return extractCommandFromMessages(messages);
}

export function runCommandNode(state: ClmmState): ClmmState {
  const commandEnvelope = extractCommandEnvelope(state.messages);
  const parsedCommand = commandEnvelope?.command ?? null;
  const lastAppliedClientMutationId =
    parsedCommand === 'sync'
      ? commandEnvelope?.clientMutationId ?? state.thread.lastAppliedClientMutationId
      : state.thread.lastAppliedClientMutationId;

  return {
    ...state,
    thread: {
      ...state.thread,
      lastAppliedClientMutationId,
    },
  };
}

export function resolveCommandTarget({ messages, private: priv, thread }: ClmmState): CommandTarget {
  const resolvedCommand = extractCommand(messages);
  if (!resolvedCommand) {
    return '__end__';
  }

  if (resolvedCommand === 'cycle') {
    if (!priv.bootstrapped) {
      return 'bootstrap';
    }

    const phase = resolveOnboardingPhase({
      hasSetupInput: Boolean(thread.operatorInput),
      hasFundingTokenInput: Boolean(thread.fundingTokenInput),
      requiresDelegationSigning: thread.delegationsBypassActive !== true,
      hasDelegationBundle: Boolean(thread.delegationBundle),
      hasOperatorConfig: Boolean(thread.operatorConfig),
      requiresSetupComplete: true,
      setupComplete: thread.setupComplete === true,
    });

    return mapOnboardingPhaseToTarget<CommandTarget>({
      phase,
      targets: {
        collectSetupInput: 'collectSetupInput',
        collectFundingToken: 'collectFundingTokenInput',
        collectDelegations: 'collectDelegations',
        prepareOperator: 'prepareOperator',
        ready: 'runCycleCommand',
      },
    });
  }

  return resolveCommandTargetForBootstrappedFlow({
    resolvedCommand,
    bootstrapped: priv.bootstrapped,
  });
}
