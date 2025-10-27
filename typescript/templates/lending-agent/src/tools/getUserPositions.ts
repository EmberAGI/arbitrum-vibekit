import type { VibkitToolDefinition } from '@emberai/arbitrum-vibekit-core';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import type { Task, Message } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import { TaskState } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import type { LendingAgentContext } from '../agent.js';
import { GetWalletLendingPositionsSchema, GetWalletLendingPositionsResponseSchema } from '@emberai/arbitrum-vibekit-core/ember-schemas';
import { createTaskId } from './utils.js';

export const getUserPositionsBase: VibkitToolDefinition<
  typeof GetWalletLendingPositionsSchema,
  Task | Message,
  LendingAgentContext
> = {
  name: 'get-user-positions-base',
  description: 'Get a summary of your current lending and borrowing positions.',
  parameters: GetWalletLendingPositionsSchema,
  execute: async (_args, context) => {
    if (!context.mcpClients?.['ember-mcp-tool-server']) {
      throw new Error('MCP client not available');
    }

    try {
      const rawResult = await context.mcpClients['ember-mcp-tool-server'].callTool({
        name: 'getUserPositions',
        arguments: {
          userAddress: 'placeholder', // TODO: Get from context
        },
      });

      // Parse and validate the MCP response
      const validatedPositions = parseMcpToolResponsePayload(
        rawResult,
        GetWalletLendingPositionsResponseSchema
      );

      return {
        id: createTaskId(),
        contextId: `user-positions-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: TaskState.Completed,
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `User positions retrieved successfully`,
              },
            ],
          },
        },
        artifacts: [
          {
            name: 'wallet-positions',
            parts: [{ kind: 'data' as const, data: validatedPositions }],
          },
        ],
      } as unknown as Task;
    } catch (error) {
      return {
        id: createTaskId(),
        contextId: `user-positions-error-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Failed to get user positions: ${(error as Error).message}`,
              },
            ],
          },
        },
      } as unknown as Task;
    }
  },
};
