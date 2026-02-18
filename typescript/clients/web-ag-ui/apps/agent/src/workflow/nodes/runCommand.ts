import { extractCommandFromMessages, type AgentCommand } from 'agent-workflow-core';

import { type ClmmState } from '../context.js';

type CommandTarget =
  | 'hireCommand'
  | 'fireCommand'
  | 'runCycleCommand'
  | 'bootstrap'
  | 'syncState'
  | '__end__';

export function extractCommand(messages: ClmmState['messages']): AgentCommand | null {
  return extractCommandFromMessages(messages);
}

export function runCommandNode(state: ClmmState): ClmmState {
  const parsedCommand = extractCommand(state.messages);
  const nextCommand =
    parsedCommand === 'sync' ? state.view.command : parsedCommand ?? state.view.command;
  return {
    ...state,
    view: {
      ...state.view,
      command: nextCommand,
    },
  };
}

export function resolveCommandTarget({ messages, private: priv, view }: ClmmState): CommandTarget {
  const resolvedCommand = extractCommand(messages) ?? view.command;
  if (!resolvedCommand) {
    return '__end__';
  }

  switch (resolvedCommand) {
    case 'hire':
      return 'hireCommand';
    case 'fire':
      return 'fireCommand';
    case 'cycle':
      return priv.bootstrapped ? 'runCycleCommand' : 'bootstrap';
    case 'sync':
      return priv.bootstrapped ? 'syncState' : 'bootstrap';
    default:
      return '__end__';
  }
}
