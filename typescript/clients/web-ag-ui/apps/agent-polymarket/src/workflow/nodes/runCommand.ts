/**
 * Run Command Node
 *
 * Routes incoming commands to the appropriate handler node.
 */

import { z } from 'zod';

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo } from '../context.js';

const commandSchema = z.object({
  command: z.enum(['hire', 'fire', 'cycle', 'sync']),
});

type Command = z.infer<typeof commandSchema>['command'];

type CommandTarget =
  | 'hireCommand'
  | 'fireCommand'
  | 'runCycleCommand'
  | 'syncState';

/**
 * Extract command from messages array.
 */
function extractCommand(messages: PolymarketState['messages']): Command | null {
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
  } catch (error) {
    logInfo('Failed to parse command content', { error: String(error) });
    return null;
  }
}

/**
 * Parse the command from the latest message and update state.
 */
export function runCommandNode(state: PolymarketState): PolymarketUpdate {
  const parsedCommand = extractCommand(state.messages);

  logInfo('runCommand processing', { command: parsedCommand ?? 'sync' });

  return {
    view: {
      command: parsedCommand ?? 'sync',
    },
  };
}

/**
 * Resolve which node to route to based on the command.
 */
export function resolveCommandTarget(state: PolymarketState): CommandTarget {
  const resolvedCommand = state.view.command ?? extractCommand(state.messages);

  logInfo('Resolving command target', { command: resolvedCommand });

  if (!resolvedCommand) {
    return 'syncState';
  }

  switch (resolvedCommand) {
    case 'hire':
      return 'hireCommand';
    case 'fire':
      return 'fireCommand';
    case 'cycle':
      return state.private.bootstrapped ? 'runCycleCommand' : 'hireCommand';
    case 'sync':
      return state.private.bootstrapped ? 'syncState' : 'hireCommand';
    default:
      return 'syncState';
  }
}
