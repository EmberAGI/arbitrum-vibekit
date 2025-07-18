import { z } from 'zod';
import type { VibkitToolDefinition, AgentContext } from 'arbitrum-vibekit-core';
import { createArtifact, createSuccessTask } from 'arbitrum-vibekit-core';
import type { Task } from '@google-a2a/types';
import {
  CreatePerpetualsPositionRequestSchema,
  ClosePerpetualsPositionRequestSchema,
  CancelPerpetualsOrdersRequestSchema,
  GetPerpetualsMarketsRequestSchema,
  GetPerpetualsMarketsPositionsRequestSchema,
  GetPerpetualsMarketsOrdersRequestSchema,
} from 'ember-api/src/schemas/perpetuals.js';

// No custom context needed for now
export type PerpetualsAgentContext = Record<string, never>;

type PerpsTool<T extends z.ZodTypeAny> = VibkitToolDefinition<
  T,
  Task,
  PerpetualsAgentContext
>;

function makePerpsProxyTool<T extends z.ZodTypeAny>(
  toolName: string,
  paramsSchema: T,
  description?: string,
): PerpsTool<T> {
  return {
    name: toolName,
    description: description || `Proxy for ${toolName} on onchain-actions MCP server`,
    parameters: paramsSchema,
    execute: async (args: z.infer<T>, context: AgentContext<PerpetualsAgentContext>) => {
      const client = context.mcpClients?.onchain;
      if (!client) {
        throw new Error('onchain MCP client not configured');
      }

      const remoteResult = await client.callTool({
        name: toolName,
        arguments: args,
      });

      const artifact = createArtifact(
        [
          {
            kind: 'data',
            data: remoteResult.structuredContent ?? remoteResult,
          },
        ],
        toolName,
        `Raw response from ${toolName}`,
      );

      return createSuccessTask('perpetuals', [artifact], `${toolName} executed`);
    },
  };
}

export const perpetualsTools = [
  makePerpsProxyTool('createPerpetualLongPosition', CreatePerpetualsPositionRequestSchema),
  makePerpsProxyTool('createPerpetualShortPosition', CreatePerpetualsPositionRequestSchema),
  makePerpsProxyTool('closePerpetualsPosition', ClosePerpetualsPositionRequestSchema),
  makePerpsProxyTool('cancelPerpetualsOrders', CancelPerpetualsOrdersRequestSchema),
  makePerpsProxyTool('getPerpetualsMarkets', GetPerpetualsMarketsRequestSchema),
  makePerpsProxyTool('getPerpetualsPositions', GetPerpetualsMarketsPositionsRequestSchema),
  makePerpsProxyTool('getPerpetualsOrders', GetPerpetualsMarketsOrdersRequestSchema),
] as const; 