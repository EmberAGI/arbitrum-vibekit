import {
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  mapOnboardingPhaseToTarget,
  resolveOnboardingPhase,
  resolveCommandTargetForBootstrappedFlow,
  resolveRunCommandForView,
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
  const nextCommand = resolveRunCommandForView({
    parsedCommand,
    currentViewCommand: state.view.command,
  });
  const lastAppliedClientMutationId =
    parsedCommand === 'sync'
      ? commandEnvelope?.clientMutationId ?? state.view.lastAppliedClientMutationId
      : state.view.lastAppliedClientMutationId;

  return {
    ...state,
    view: {
      ...state.view,
      command: nextCommand,
      lastAppliedClientMutationId,
    },
  };
}

export function resolveCommandTarget({ messages, private: priv, view }: ClmmState): CommandTarget {
  const resolvedCommand = extractCommand(messages) ?? view.command;
  if (!resolvedCommand) {
    return '__end__';
  }

  if (resolvedCommand === 'cycle') {
    if (!priv.bootstrapped) {
      return 'bootstrap';
    }

    const phase = resolveOnboardingPhase({
      hasSetupInput: Boolean(view.operatorInput),
      hasFundingTokenInput: Boolean(view.fundingTokenInput),
      requiresDelegationSigning: view.delegationsBypassActive !== true,
      hasDelegationBundle: Boolean(view.delegationBundle),
      hasOperatorConfig: Boolean(view.operatorConfig),
      requiresSetupComplete: true,
      setupComplete: view.setupComplete === true,
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
