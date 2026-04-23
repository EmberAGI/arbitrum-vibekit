import {
  extractCommandEnvelope as extractWorkflowCommandEnvelope,
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
    parsedCommand === 'refresh'
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

export function resolveCommandTarget({ private: priv, thread }: ClmmState): CommandTarget {
  if (priv.suppressDuplicateCommand === true) {
    return '__end__';
  }

  const resolvedCommand = extractCommand(priv.activeCommand);
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
