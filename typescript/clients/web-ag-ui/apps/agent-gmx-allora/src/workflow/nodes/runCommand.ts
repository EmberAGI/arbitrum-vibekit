import {
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  resolveCommandTargetForBootstrappedFlow,
  type AgentCommand,
  type CommandEnvelope,
  type CommandRoutingTarget,
} from 'agent-workflow-core';

import { logWarn, type ClmmState } from '../context.js';

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

export function runCommandNode(state: ClmmState): ClmmState {
  const commandEnvelope = extractCommandEnvelope(state.messages);
  const parsedCommand = commandEnvelope?.command ?? null;
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
    ...state,
    thread: {
      ...state.thread,
      lastAppliedClientMutationId,
    },
  };
}

export function resolveCommandTarget({ messages, private: priv, thread }: ClmmState): CommandTarget {
  const resolvedCommand = extractCommand(messages);
  const target = resolveCommandTargetForBootstrappedFlow({
    resolvedCommand,
    bootstrapped: priv.bootstrapped,
  });

  if (shouldTraceCommand(resolvedCommand)) {
    logWarn('runCommand: resolved command target', {
      resolvedCommand,
      target,
      bootstrapped: priv.bootstrapped,
      taskState: thread.task?.taskStatus?.state,
      taskMessage: thread.task?.taskStatus?.message?.content,
    });
  }
  return target;
}
