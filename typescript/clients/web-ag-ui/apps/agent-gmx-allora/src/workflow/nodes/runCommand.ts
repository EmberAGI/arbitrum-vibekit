import {
  extractCommandEnvelope as extractWorkflowCommandEnvelope,
  resolveCommandReplayGuardState,
  resolveCycleCommandTarget,
  resolveCommandTargetForBootstrappedFlow,
  type AgentCommand,
  type CommandEnvelope,
  type CommandRoutingTarget,
} from 'agent-workflow-core';

import { logWarn, type ClmmState, type ClmmUpdate } from '../context.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';

type CommandTarget = CommandRoutingTarget;
const TRACEABLE_COMMANDS: readonly AgentCommand[] = ['hire', 'fire', 'cycle'];

function shouldTraceCommand(command: AgentCommand | null | undefined): command is AgentCommand {
  return command !== null && command !== undefined && TRACEABLE_COMMANDS.includes(command);
}

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

  if (shouldTraceCommand(parsedCommand)) {
    logWarn('runCommand: received command envelope', {
      parsedCommand,
      messageCount: state.messages.length,
      onboardingStep: state.thread.onboarding?.step,
      onboardingKey: state.thread.onboarding?.key,
      hasOperatorConfig: Boolean(state.thread.operatorConfig),
      hasDelegationBundle: Boolean(state.thread.delegationBundle),
      clientMutationId: commandEnvelope?.clientMutationId,
    });
  }

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
    const target = resolveCycleCommandTarget({
      bootstrapped: state.private.bootstrapped,
      onboardingReady: resolveNextOnboardingNode(state) === 'syncState',
    });

    if (shouldTraceCommand(resolvedCommand)) {
      logWarn('runCommand: resolved command target', {
        resolvedCommand,
        target,
        bootstrapped: state.private.bootstrapped,
        taskState: state.thread.task?.taskStatus?.state,
        taskMessage: state.thread.task?.taskStatus?.message?.content,
      });
    }
    return target;
  }

  const target = resolveCommandTargetForBootstrappedFlow({
    resolvedCommand,
    bootstrapped: state.private.bootstrapped,
  });

  if (shouldTraceCommand(resolvedCommand)) {
    logWarn('runCommand: resolved command target', {
      resolvedCommand,
      target,
      bootstrapped: state.private.bootstrapped,
      taskState: state.thread.task?.taskStatus?.state,
      taskMessage: state.thread.task?.taskStatus?.message?.content,
    });
  }
  return target;
}
