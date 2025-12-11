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

function extractCommand(messages: ClmmState['messages']): Command | null {
  if (!messages || messages.length === 0) {
    return null;
  }

  const lastMessage = messages[messages.length - 1];
  const content = typeof lastMessage.content === 'string' ? lastMessage.content : undefined;
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
  return {
    ...state,
    command: parsedCommand ?? undefined,
  };
}

export function resolveCommandTarget({ messages, bootstrapped, command }: ClmmState): CommandTarget {
  const resolvedCommand = command ?? extractCommand(messages);
  if (!resolvedCommand) {
    return '__end__';
  }

  switch (resolvedCommand) {
    case 'hire':
      return 'hireCommand';
    case 'fire':
      return 'fireCommand';
    case 'cycle':
      return bootstrapped ? 'runCycleCommand' : 'bootstrap';
    case 'sync':
      return bootstrapped ? 'syncState' : 'bootstrap';
    default:
      return '__end__';
  }
}
