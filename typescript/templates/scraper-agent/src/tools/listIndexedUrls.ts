import { createSuccessTask, createErrorTask, createArtifact } from 'arbitrum-vibekit-core';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';

export const listIndexedUrlsTool: VibkitToolDefinition<z.ZodObject<{}>> = {
  name: 'list-indexed-urls',
  description: 'List all URLs that have been indexed',
  parameters: z.object({}),
  execute: async (_input, context) => {
    try {
      // Check if MCP client is available
      const mcpClientKey = '/app/lib/mcp-tools/doc-rag-mcp-server/dist/index.js';
      if (!context.mcpClients?.[mcpClientKey]) {
        throw new Error('Documentation RAG MCP server not connected');
      }

      // Call the MCP server tool
      const result = await context.mcpClients[mcpClientKey].callTool({
        name: 'list_indexed_urls',
        arguments: {},
      });

      // Parse the response
      const responseText = (result as any).content[0].text;

      // Check if response is an error message
      if (responseText.startsWith('Error:') || responseText.startsWith('Failed:')) {
        throw new Error(responseText);
      }

      const response = JSON.parse(responseText);

      // Create artifacts for the indexed URLs
      const artifacts = [
        createArtifact(
          [{ kind: 'text', text: JSON.stringify(response, null, 2) }],
          'Indexed URLs',
          response.summary
        ),
      ];

      return createSuccessTask('list-indexed-urls', artifacts, response.summary);
    } catch (error) {
      return createErrorTask(
        'list-indexed-urls',
        error instanceof Error ? error : new Error('Failed to list indexed URLs')
      );
    }
  },
};
