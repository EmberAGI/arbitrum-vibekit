import { createSuccessTask, createErrorTask, createArtifact } from 'arbitrum-vibekit-core';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';

const QueryDocumentationSchema = z.object({
  query: z.string().min(1).describe('Natural language query'),
  topK: z.number().int().positive().default(5).describe('Number of relevant chunks to retrieve'),
});

export const queryDocumentationTool: VibkitToolDefinition<typeof QueryDocumentationSchema> = {
  name: 'query-documentation',
  description: 'Query indexed documentation using natural language',
  parameters: QueryDocumentationSchema,
  execute: async (input, context) => {
    try {
      // Check if MCP client is available
      const mcpClientKey = 'doc-rag-server';
      if (!context.mcpClients?.[mcpClientKey]) {
        throw new Error('Documentation RAG MCP server not connected');
      }

      // Call the MCP server tool
      const result = await context.mcpClients[mcpClientKey].callTool({
        name: 'query_documentation',
        arguments: {
          query: input.query,
          topK: input.topK,
        },
      });

      // Parse the response
      const responseText = (result as any).content[0].text;

      // Check for error messages
      if (
        responseText.includes('Error:') ||
        responseText.includes('No documents have been indexed')
      ) {
        throw new Error(responseText);
      }

      const response = JSON.parse(responseText);

      // Create artifacts for the query results
      const artifacts = [
        createArtifact(
          [{ kind: 'text', text: JSON.stringify(response, null, 2) }],
          'Query Results',
          `Found ${response.totalResults} relevant documentation chunks`
        ),
      ];

      return createSuccessTask(
        'query-documentation',
        artifacts,
        `Found ${response.totalResults} relevant documentation chunks for query: "${response.query}"`
      );
    } catch (error) {
      return createErrorTask(
        'query-documentation',
        error instanceof Error ? error : new Error('Failed to query documentation')
      );
    }
  },
};
