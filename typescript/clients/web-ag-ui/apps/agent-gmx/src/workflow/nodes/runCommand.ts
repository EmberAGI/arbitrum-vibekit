import { z } from 'zod';

import { type GMXState } from '../context.js';

const commandSchema = z.object({
  command: z.enum(['hire', 'fire', 'poll', 'openPosition', 'closePosition', 'holdPosition']),
});

type Command = z.infer<typeof commandSchema>['command'];

type CommandTarget =
  | 'hireCommand'
  | 'fireCommand'
  | 'pollCommand'
  | 'openPositionCommand'
  | 'closePositionCommand'
  | 'holdPositionCommand'
  | '__end__';

function extractCommand(messages: GMXState['messages']): Command | null {
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
    const value = (lastMessage as { content: unknown }).content;
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

export function runCommandNode(state: GMXState): GMXState {
  const parsedCommand = extractCommand(state.messages);
  return {
    ...state,
    view: {
      ...state.view,
      command: parsedCommand ?? undefined,
    },
  };
}

export function resolveCommandTarget({ messages, private: priv, view }: GMXState): CommandTarget {
  const resolvedCommand = view.command ?? extractCommand(messages);
  if (!resolvedCommand) {
    return '__end__';
  }

  switch (resolvedCommand) {
    case 'hire':
      return 'hireCommand';
    case 'fire':
      return 'fireCommand';
    case 'poll':
      return 'pollCommand';
    case 'openPosition':
      return 'openPositionCommand';
    case 'closePosition':
      return 'closePositionCommand';
    case 'holdPosition':
      return 'holdPositionCommand';
    default:
      return '__end__';
  }
}
