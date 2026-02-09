import { z } from 'zod';

import { type ClmmState } from '../context.js';

const commandSchema = z.object({
  command: z.enum(['hire', 'fire', 'cycle', 'sync']),
});

type Command = z.infer<typeof commandSchema>['command'];

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

export function extractCommand(messages: ClmmState['messages']): Command | null {
  if (!messages) {
    return null;
  }

  const list = Array.isArray(messages) ? messages : [messages];
  if (list.length === 0) {
    return null;
  }

  const lastMessage = list[list.length - 1];
  let content: string | undefined;
  if (typeof lastMessage === 'string') {
    content = lastMessage;
  } else if (Array.isArray(lastMessage)) {
    content = undefined;
  } else if (typeof lastMessage === 'object' && lastMessage !== null && 'content' in lastMessage) {
    const value = (lastMessage as { content?: unknown }).content;
    content = typeof value === 'string' ? value : undefined;
  }
  if (!content) {
    return null;
  }

  try {
    const parsed = commandSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      return null;
    }
    return parsed.data.command;
  } catch (unknownError) {
    console.error('[runCommand] Failed to parse command content', unknownError);
    return null;
  }
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
