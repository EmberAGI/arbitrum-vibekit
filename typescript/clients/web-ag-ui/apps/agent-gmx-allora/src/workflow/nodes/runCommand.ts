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

import { logWarn, type ClmmState, type ClmmUpdate } from '../context.js';
import { resolveNextOnboardingNode } from '../onboardingRouting.js';

type CommandTarget = CommandRoutingTarget;
const TRACEABLE_COMMANDS: readonly AgentCommand[] = ['hire', 'fire', 'cycle'];

function shouldTraceCommand(command: AgentCommand | null | undefined): command is AgentCommand {
  return command !== null && command !== undefined && TRACEABLE_COMMANDS.includes(command);
}

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

  const resolvedCommand = extractCommand(state.messages);
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
