import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { indexDocumentationTool } from '../tools/indexDocumentation.js';
import { queryDocumentationTool } from '../tools/queryDocumentation.js';
import { clearIndexTool } from '../tools/clearIndex.js';
import { listIndexedUrlsTool } from '../tools/listIndexedUrls.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const documentationRAGSkill = defineSkill({
  id: 'documentation-rag',
  name: 'Documentation RAG',
  description:
    'Complete documentation RAG system - index, query, and manage documentation. Always ask users how many pages to scrape (recommend 10-20 for testing, 50-100 for full docs).',
  tags: ['documentation', 'rag', 'indexing', 'query', 'search', 'scraping'],
  examples: [
    'Index the React documentation from https://react.dev with 20 pages',
    'How do React hooks work?',
    'What is the useEffect cleanup function?',
    'List all indexed documentation',
    'Clear the documentation index',
  ],
  inputSchema: z.object({
    instruction: z.string().describe('Natural language instruction for documentation operations'),
  }),
  tools: [indexDocumentationTool, queryDocumentationTool, listIndexedUrlsTool, clearIndexTool],

  // Single MCP server configuration shared by all tools
  mcpServers: [
    {
      command: 'node',
      moduleName: path.join(
        __dirname,
        '../../../../lib/mcp-tools/doc-rag-mcp-server/dist/index.js'
      ),
      env: Object.fromEntries(
        Object.entries(process.env).filter(([_, value]) => value !== undefined)
      ) as Record<string, string>,
    },
  ],
});
