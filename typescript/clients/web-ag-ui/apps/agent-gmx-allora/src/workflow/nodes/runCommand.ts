import {
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  resolveCommandTargetForBootstrappedFlow,
  resolveRunCommandForView,
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
  const nextCommand = resolveRunCommandForView({
    parsedCommand,
    currentViewCommand: state.view.command,
  });
  const lastAppliedClientMutationId =
    parsedCommand === 'sync'
      ? commandEnvelope?.clientMutationId ?? state.view.lastAppliedClientMutationId
      : state.view.lastAppliedClientMutationId;

  if (shouldTraceCommand(parsedCommand)) {
    logWarn('runCommand: received command envelope', {
      parsedCommand,
      nextCommand,
      currentViewCommand: state.view.command,
      messageCount: state.messages.length,
      onboardingStatus: state.view.onboardingFlow?.status,
      onboardingStep: state.view.onboarding?.step,
      onboardingKey: state.view.onboarding?.key,
      hasOperatorConfig: Boolean(state.view.operatorConfig),
      hasDelegationBundle: Boolean(state.view.delegationBundle),
      clientMutationId: commandEnvelope?.clientMutationId,
    });
  }

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
  const target = resolveCommandTargetForBootstrappedFlow({
    resolvedCommand,
    bootstrapped: priv.bootstrapped,
  });

  if (shouldTraceCommand(resolvedCommand)) {
    logWarn('runCommand: resolved command target', {
      resolvedCommand,
      target,
      bootstrapped: priv.bootstrapped,
      taskState: view.task?.taskStatus?.state,
      taskMessage: view.task?.taskStatus?.message?.content,
      onboardingStatus: view.onboardingFlow?.status,
    });
  }
  return target;
}
