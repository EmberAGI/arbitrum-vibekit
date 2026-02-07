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
    parsedCommand === 'sync' ? state.view.command : (parsedCommand ?? state.view.command);
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
