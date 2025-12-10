import { z } from 'zod';

import { type ClmmState } from '../context.js';

const commandSchema = z.object({
  command: z.enum(['hire', 'fire', 'cycle']),
});

type CommandTarget = 'hireCommand' | 'fireCommand' | 'runCycleCommand' | 'bootstrap' | '__end__';

export function runCommandNode(state: ClmmState): ClmmState {
  void state; // passthrough; routing handled by conditional edges
  return state;
}

export function resolveCommandTarget({ messages, bootstrapped }: ClmmState): CommandTarget {
  if (!messages || messages.length === 0) {
    return '__end__';
  }

  const lastMessage = messages[messages.length - 1];
  const content = typeof lastMessage.content === 'string' ? lastMessage.content : undefined;
  if (!content) {
    return '__end__';
  }

  let command: string;
  try {
    const parsed = commandSchema.safeParse(JSON.parse(content));
    if (parsed.success) {
      command = parsed.data.command;
    } else {
      return '__end__';
    }
  } catch (unknownError) {
    console.error('[runCommand] Failed to parse command content', unknownError);
    return '__end__';
  }

  switch (command) {
    case 'hire':
      return 'hireCommand';
    case 'fire':
      return 'fireCommand';
    case 'cycle':
      return bootstrapped ? 'runCycleCommand' : 'bootstrap';
    default:
      return '__end__';
  }
}
