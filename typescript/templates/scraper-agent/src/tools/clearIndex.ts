import { createSuccessTask, createErrorTask, createArtifact } from 'arbitrum-vibekit-core';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';

export const clearIndexTool: VibkitToolDefinition<z.ZodObject<{}>> = {
  name: 'clear-index',
  description: 'Clear the entire documentation index',
  parameters: z.object({}),
  execute: async (_input, context) => {
    try {
      // Check if MCP client is available
      const mcpClientKey = 'doc-rag-server';
      if (!context.mcpClients?.[mcpClientKey]) {
        throw new Error('Documentation RAG MCP server not connected');
      }

      // Call the MCP server tool
      const result = await context.mcpClients[mcpClientKey].callTool({
        name: 'clear_index',
        arguments: {},
      });

      // Get the response
      const response = (result as any).content[0].text;

      // Create artifacts for the result
      const artifacts = [
        createArtifact(
          [{ kind: 'text', text: response }],
          'Clear Index Result',
          'Documentation index cleared'
        ),
      ];

      return createSuccessTask('clear-index', artifacts, response);
    } catch (error) {
      return createErrorTask(
        'clear-index',
        error instanceof Error ? error : new Error('Failed to clear documentation index')
      );
    }
  },
};
