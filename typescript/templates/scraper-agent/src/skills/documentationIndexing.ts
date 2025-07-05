import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { indexDocumentationTool } from '../tools/indexDocumentation.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const documentationIndexingSkill = defineSkill({
  id: 'documentation-indexing',
  name: 'Documentation Indexing',
  description:
    'Index and scrape documentation from websites for later querying. Always ask the user how many pages to scrape (recommend 10-20 for testing, 50-100 for full docs).',
  tags: ['documentation', 'indexing', 'scraping', 'rag'],
  examples: [
    'Index the React documentation from https://react.dev with 20 pages',
    'Scrape and index the Next.js docs at https://nextjs.org/docs with 50 pages',
    'Index https://docs.python.org/3/ with a maximum of 30 pages',
  ],
  inputSchema: z.object({
    instruction: z.string().describe('Natural language instruction for indexing documentation'),
  }),
  tools: [indexDocumentationTool],

  // MCP server configuration
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
