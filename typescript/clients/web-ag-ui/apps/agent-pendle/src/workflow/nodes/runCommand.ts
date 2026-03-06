import {
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  resolveCommandReplayGuardState,
  resolveCycleCommandTarget,
  resolveOnboardingPhase,
  resolveCommandTargetForBootstrappedFlow,
  type AgentCommand,
  type CommandEnvelope,
  type CommandRoutingTarget,
} from 'agent-workflow-core';

import { type ClmmState, type ClmmUpdate } from '../context.js';

type CommandTarget = CommandRoutingTarget;

export function extractCommandEnvelope(messages: ClmmState['messages']): CommandEnvelope | null {
  return extractCommandEnvelopeFromMessages(messages);
}

export function extractCommand(messages: ClmmState['messages']): AgentCommand | null {
  return extractCommandFromMessages(messages);
}

export function runCommandNode(state: ClmmState): ClmmUpdate {
  const commandEnvelope = extractCommandEnvelope(state.messages);
  const parsedCommand = commandEnvelope?.command ?? null;
  const replayGuardState = resolveCommandReplayGuardState({
    parsedCommand,
    clientMutationId: commandEnvelope?.clientMutationId,
    lastAppliedCommandMutationId: state.private.lastAppliedCommandMutationId,
  });
  const lastAppliedClientMutationId =
    parsedCommand === 'sync'
      ? commandEnvelope?.clientMutationId ?? state.thread.lastAppliedClientMutationId
      : state.thread.lastAppliedClientMutationId;

  return {
    private: {
      suppressDuplicateCommand: replayGuardState.suppressDuplicateCommand,
      lastAppliedCommandMutationId: replayGuardState.lastAppliedCommandMutationId,
    },
    thread: {
      lastAppliedClientMutationId,
    },
  };
}

export function resolveCommandTarget({ messages, private: priv, thread }: ClmmState): CommandTarget {
  if (priv.suppressDuplicateCommand === true) {
    return '__end__';
  }

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

    return resolveCycleCommandTarget({
      bootstrapped: priv.bootstrapped,
      onboardingReady: phase === 'ready',
    });
  }

  return resolveCommandTargetForBootstrappedFlow({
    resolvedCommand,
    bootstrapped: priv.bootstrapped,
  });
}
