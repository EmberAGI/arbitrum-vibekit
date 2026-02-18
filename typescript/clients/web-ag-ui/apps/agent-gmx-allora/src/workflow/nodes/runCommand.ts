import {
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  resolveCommandTargetForBootstrappedFlow,
  resolveRunCommandForView,
  type AgentCommand,
  type CommandEnvelope,
  type CommandRoutingTarget,
} from 'agent-workflow-core';

import { type ClmmState } from '../context.js';

type CommandTarget = CommandRoutingTarget;

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
  return resolveCommandTargetForBootstrappedFlow({
    resolvedCommand: extractCommand(messages) ?? view.command,
    bootstrapped: priv.bootstrapped,
  });
}
