import {
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  resolveCommandReplayGuardState,
  resolveCycleCommandTarget,
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

function isOnboardingReady(state: ClmmState): boolean {
  if (!state.thread.poolArtifact) {
    return false;
  }
  if (!state.thread.operatorInput) {
    return false;
  }
  if (!state.thread.fundingTokenInput) {
    return false;
  }
  if (state.thread.delegationsBypassActive !== true && !state.thread.delegationBundle) {
    return false;
  }
  return Boolean(state.thread.operatorConfig);
}

export function resolveCommandTarget(state: ClmmState): CommandTarget {
  if (state.private.suppressDuplicateCommand === true) {
    return '__end__';
  }

  const resolvedCommand = extractCommand(state.messages);
  if (resolvedCommand === 'cycle') {
    return resolveCycleCommandTarget({
      bootstrapped: state.private.bootstrapped,
      onboardingReady: isOnboardingReady(state),
    });
  }

  return resolveCommandTargetForBootstrappedFlow({
    resolvedCommand,
    bootstrapped: state.private.bootstrapped,
  });
}
