import {
  extractCommandEnvelopeFromMessages,
  extractCommandFromMessages,
  resolveCommandTargetForBootstrappedFlow,
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
  const lastAppliedClientMutationId =
    parsedCommand === 'sync'
      ? commandEnvelope?.clientMutationId ?? state.thread.lastAppliedClientMutationId
      : state.thread.lastAppliedClientMutationId;

  return {
    ...state,
    thread: {
      ...state.thread,
      lastAppliedClientMutationId,
    },
  };
}

export function resolveCommandTarget({ messages, private: priv }: ClmmState): CommandTarget {
  return resolveCommandTargetForBootstrappedFlow({
    resolvedCommand: extractCommand(messages),
    bootstrapped: priv.bootstrapped,
  });
}
