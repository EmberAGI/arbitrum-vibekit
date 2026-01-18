/**
 * Run Command Node
 *
 * Routes incoming commands to the appropriate handler node.
 */

import { z } from 'zod';

import type { PolymarketState, PolymarketUpdate } from '../context.js';
import { logInfo } from '../context.js';

const commandSchema = z.object({
  command: z.enum(['hire', 'fire', 'cycle', 'sync', 'updateApproval']),
  data: z
    .object({
      approvalAmount: z.string(),
      userWalletAddress: z.string(),
    })
    .optional(),
});

type Command = z.infer<typeof commandSchema>['command'];
type CommandData = z.infer<typeof commandSchema>['data'];

type CommandTarget =
  | 'hireCommand'
  | 'fireCommand'
  | 'runCycleCommand'
  | 'syncState'
  | 'updateApprovalCommand';

/**
 * Parsed command with optional data payload
 */
type ParsedCommand = {
  command: Command;
  data?: CommandData;
};

/**
 * Extract command and data from messages array.
 */
function extractCommand(messages: PolymarketState['messages']): ParsedCommand | null {
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
    return {
      command: parsed.data.command,
      data: parsed.data.data,
    };
  } catch (error) {
    logInfo('Failed to parse command content', { error: String(error) });
    return null;
  }
}

/**
 * Parse the command from the latest message and update state.
 */
export function runCommandNode(state: PolymarketState): PolymarketUpdate {
  const parsed = extractCommand(state.messages);
  const command = parsed?.command ?? 'sync';

  console.log('[runCommand] Command:', command, parsed?.data ? 'with data' : '');

  logInfo('=== POLYMARKET AGENT received command ===', {
    command,
    hasData: !!parsed?.data,
    lifecycleState: state.view.lifecycleState,
    bootstrapped: state.private?.bootstrapped ?? false,
  });

  // For updateApproval command, store the data in state
  if (command === 'updateApproval' && parsed?.data) {
    console.log('[runCommand] updateApproval:', parsed.data.approvalAmount);
    return {
      view: {
        command,
        requestedApprovalAmount: parsed.data.approvalAmount,
        forceApprovalUpdate: true,
      },
      private: {
        userWalletAddress: parsed.data.userWalletAddress,
      },
    };
  }

  return {
    view: {
      command,
    },
  };
}

/**
 * Resolve which node to route to based on the command.
 */
export function resolveCommandTarget(state: PolymarketState): CommandTarget {
  const parsed = extractCommand(state.messages);
  const resolvedCommand = state.view.command ?? parsed?.command;

  logInfo('Resolving command target', { command: resolvedCommand });

  if (!resolvedCommand) {
    return 'syncState';
  }

  let target: CommandTarget;
  switch (resolvedCommand) {
    case 'hire':
      target = 'hireCommand';
      break;
    case 'fire':
      target = 'fireCommand';
      break;
    case 'cycle':
      target = state.private.bootstrapped ? 'runCycleCommand' : 'hireCommand';
      break;
    case 'sync':
      target = state.private.bootstrapped ? 'syncState' : 'hireCommand';
      break;
    case 'updateApproval':
      target = 'updateApprovalCommand';
      break;
    default:
      target = 'syncState';
  }

  console.log('[resolveCommandTarget] →', target);
  return target;
}
