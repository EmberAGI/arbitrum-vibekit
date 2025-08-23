import { createSuccessTask, createErrorTask, createArtifact } from 'arbitrum-vibekit-core';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { z } from 'zod';

const IndexDocumentationSchema = z.object({
  baseUrl: z.string().url().describe('Base URL to scrape (will not go beyond this domain/path)'),
  maxPages: z
    .number()
    .int()
    .positive()
    .min(1)
    .max(1000)
    .describe(
      'Maximum pages to scrape (1-1000). Recommend starting with 10-20 for testing, 50-100 for full docs.'
    ),
  selector: z
    .string()
    .default('main, article, .content, .documentation')
    .describe('CSS selector for main content (optional, uses smart defaults)'),
});

export const indexDocumentationTool: VibkitToolDefinition<typeof IndexDocumentationSchema> = {
  name: 'index-documentation',
  description: 'Scrape and index documentation from a website',
  parameters: IndexDocumentationSchema,
  execute: async (input, context) => {
    try {
      // Check if MCP client is available
      const mcpClientKey = 'doc-rag-server';
      if (!context.mcpClients?.[mcpClientKey]) {
        throw new Error('Documentation RAG MCP server not connected');
      }

      // Call the MCP server tool
      const result = await context.mcpClients[mcpClientKey].callTool({
        name: 'index_documentation',
        arguments: {
          baseUrl: input.baseUrl,
          maxPages: input.maxPages,
          selector: input.selector,
        },
      });

      // Parse the response
      const responseText = (result as any).content[0].text;

      console.log('MCP server response:', responseText);

      // Check if response is an error message
      if (responseText.startsWith('Error:') || responseText.startsWith('Failed:')) {
        throw new Error(responseText);
      }

      // Try to parse as JSON, but handle plain text responses
      let response;
      try {
        response = JSON.parse(responseText);
      } catch (e) {
        // If not JSON, create a response object from the text
        const match = responseText.match(/Successfully indexed (\d+) pages from (.+)/);
        if (match) {
          response = {
            success: true,
            totalPagesScraped: parseInt(match[1]),
            baseUrl: match[2],
            message: responseText,
          };
        } else {
          response = {
            success: true,
            message: responseText,
            baseUrl: input.baseUrl,
            totalPagesScraped: 'unknown',
          };
        }
      }

      // Create artifacts for the indexed data
      const artifacts = [
        createArtifact(
          [{ kind: 'text', text: JSON.stringify(response, null, 2) }],
          'Documentation Indexing Results',
          `Successfully indexed documentation from ${input.baseUrl}`
        ),
        createArtifact(
          [
            {
              kind: 'text',
              text: `
**Indexing Summary:**
- 🌐 Base URL: ${input.baseUrl}
- 📄 Pages Scraped: ${response.totalPagesScraped || 'Processing...'}
- ⚙️ Max Pages Limit: ${input.maxPages}
- 🎯 CSS Selector: ${input.selector}

**Next Steps:**
You can now query this documentation using natural language questions!

**Example queries:**
- "How do React hooks work?"
- "What is the difference between useState and useEffect?"
- "Show me examples of JSX syntax"
          `.trim(),
            },
          ],
          'How to Use Your Indexed Documentation',
          'Guide for querying the newly indexed documentation'
        ),
      ];

      const successMessage = response.totalPagesScraped
        ? `✅ Successfully indexed ${response.totalPagesScraped} pages from ${input.baseUrl}! You can now query this documentation with natural language questions.`
        : `✅ Successfully started indexing ${input.baseUrl}! The process may still be running. You can check progress and query once complete.`;

      return createSuccessTask('index-documentation', artifacts, successMessage);
    } catch (error) {
      return createErrorTask(
        'index-documentation',
        error instanceof Error ? error : new Error('Failed to index documentation')
      );
    }
  },
};
