import {
  extractCommandEnvelope as extractWorkflowCommandEnvelope,
  resolveCommandReplayGuardState,
  resolveCycleCommandTarget,
  resolveCommandTargetForBootstrappedFlow,
  type AgentCommand,
  type CommandEnvelope,
  type CommandRoutingTarget,
} from 'agent-workflow-core';

import { type ClmmState, type ClmmUpdate } from '../context.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';

type CommandTarget = CommandRoutingTarget;

export function extractCommandEnvelope(
  pendingCommand: ClmmState['private']['pendingCommand'],
): CommandEnvelope<AgentCommand> | null {
  return extractWorkflowCommandEnvelope(pendingCommand);
}

export function extractCommand(activeCommand: ClmmState['private']['activeCommand']): AgentCommand | null {
  return activeCommand ?? null;
}

export function runCommandNode(state: ClmmState): ClmmUpdate {
  const commandEnvelope = extractCommandEnvelope(state.private.pendingCommand);
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
      pendingCommand: null,
      activeCommand: parsedCommand,
      suppressDuplicateCommand: replayGuardState.suppressDuplicateCommand,
      lastAppliedCommandMutationId: replayGuardState.lastAppliedCommandMutationId,
    },
    thread: {
      lastAppliedClientMutationId,
    },
  };
}

export function resolveCommandTarget(state: ClmmState): CommandTarget {
  if (state.private.suppressDuplicateCommand === true) {
    return '__end__';
  }

  const resolvedCommand = extractCommand(state.private.activeCommand);
  if (resolvedCommand === 'cycle') {
    return resolveCycleCommandTarget({
      bootstrapped: state.private.bootstrapped,
      onboardingReady: resolveNextOnboardingNode(state) === 'syncState',
    });
  }

  return resolveCommandTargetForBootstrappedFlow({
    resolvedCommand,
    bootstrapped: state.private.bootstrapped,
  });
}
