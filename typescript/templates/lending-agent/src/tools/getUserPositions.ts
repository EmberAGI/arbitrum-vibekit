import type { VibkitToolDefinition, AgentContext } from 'arbitrum-vibekit-core';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import type { Task, Message, TaskState } from '@google-a2a/types/src/types.js';
import type { LendingAgentContext } from '../agent.js';
import { GetUserPositionsSchema, ZodGetWalletPositionsResponseSchema } from './schemas.js';
import { createTaskId } from './utils.js';

export const getUserPositionsBase: VibkitToolDefinition<
  typeof GetUserPositionsSchema,
  Task | Message,
  LendingAgentContext
> = {
  description: 'Get a summary of your current lending and borrowing positions.',
  parameters: GetUserPositionsSchema,
  execute: async (args, context) => {
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
        ZodGetWalletPositionsResponseSchema
      );

      return {
        id: createTaskId(),
        contextId: `user-positions-${Date.now()}`,
        kind: 'task' as const,
        status: {
          state: 'completed' as TaskState,
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: 'Positions fetched successfully.' }],
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
          state: 'failed' as TaskState,
          message: {
            role: 'agent',
            parts: [
              { type: 'text', text: `Error fetching positions: ${(error as Error).message}` },
            ],
          },
        },
      } as unknown as Task;
    }
  },
};
