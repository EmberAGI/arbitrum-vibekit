import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import type { Task, Message } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { AskEncyclopediaSchema } from '@emberai/arbitrum-vibekit-core/ember-schemas';
import type { LendingAgentContext } from '../agent.js';
import { createTaskId } from './utils.js';

export const askEncyclopediaBase: VibkitToolDefinition<
  typeof AskEncyclopediaSchema,
  Task | Message,
  LendingAgentContext
> = {
  name: 'ask-encyclopedia',
  description:
    'Ask a question about Aave to retrieve specific information about the protocol using embedded documentation.',
  parameters: AskEncyclopediaSchema,
  execute: async (args, _context) => {
    // Note: In the reference implementation, this doesn't use MCP
    // It uses OpenRouter to query against local documentation
    // For now, we'll return a simple message
    // TODO: Implement proper encyclopedia querying

    return {
      id: createTaskId(),
      contextId: `encyclopedia-${Date.now()}`,
      kind: 'task' as const,
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Encyclopedia feature not yet implemented. Question received: ${args.question}`,
            },
          ],
        },
      },
    } as unknown as Task;
  },
};
