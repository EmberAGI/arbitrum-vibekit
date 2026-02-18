import { extractCommandFromMessages, type AgentCommand } from 'agent-workflow-core';

import { type ClmmState } from '../context.js';

type CommandTarget =
  | 'hireCommand'
  | 'fireCommand'
  | 'runCycleCommand'
  | 'collectSetupInput'
  | 'collectFundingTokenInput'
  | 'collectDelegations'
  | 'prepareOperator'
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

  if (resolvedCommand === 'cycle') {
    if (!priv.bootstrapped) {
      return 'bootstrap';
    }

    // Cycle commands can be triggered by cron / API runners or UI interactions while
    // onboarding is still in progress. Route "cycle" into the next missing onboarding
    // step instead of letting it hit `pollCycle` and terminal-fail.
    if (!view.operatorInput) {
      return 'collectSetupInput';
    }
    if (!view.fundingTokenInput) {
      return 'collectFundingTokenInput';
    }
    if (view.delegationsBypassActive !== true && !view.delegationBundle) {
      return 'collectDelegations';
    }
    if (!view.operatorConfig || view.setupComplete !== true) {
      return 'prepareOperator';
    }

    return 'runCycleCommand';
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
