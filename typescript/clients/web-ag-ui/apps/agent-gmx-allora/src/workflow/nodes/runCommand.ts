import {
  extractCommandFromMessages,
  resolveCommandTargetForBootstrappedFlow,
  resolveRunCommandForView,
  type AgentCommand,
  type CommandRoutingTarget,
} from 'agent-workflow-core';

import { type ClmmState } from '../context.js';

type CommandTarget = CommandRoutingTarget;

export function extractCommand(messages: ClmmState['messages']): AgentCommand | null {
  return extractCommandFromMessages(messages);
}

export function runCommandNode(state: ClmmState): ClmmState {
  const parsedCommand = extractCommand(state.messages);
  const nextCommand = resolveRunCommandForView({
    parsedCommand,
    currentViewCommand: state.view.command,
  });
  return {
    ...state,
    view: {
      ...state.view,
      command: nextCommand,
    },
  };
}

export function resolveCommandTarget({ messages, private: priv, view }: ClmmState): CommandTarget {
  return resolveCommandTargetForBootstrappedFlow({
    resolvedCommand: extractCommand(messages) ?? view.command,
    bootstrapped: priv.bootstrapped,
  });
}
