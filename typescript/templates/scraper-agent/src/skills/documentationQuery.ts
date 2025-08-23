import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { queryDocumentationTool } from '../tools/queryDocumentation.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const documentationQuerySkill = defineSkill({
  id: 'documentation-query',
  name: 'Documentation Query',
  description:
    'Query indexed documentation using natural language and get relevant chunks with citations',
  tags: ['documentation', 'query', 'search', 'rag'],
  examples: [
    'How do React hooks work?',
    'What is the useEffect cleanup function?',
    'Explain Next.js server components',
    'Find information about Python decorators',
  ],
  inputSchema: z.object({
    instruction: z.string().describe('Natural language query to search indexed documentation'),
  }),
  tools: [queryDocumentationTool],

  // MCP server configuration
  mcpServers: {
    'doc-rag-server': {
      command: 'node',
      args: [path.join(
        __dirname,
        '../../../../lib/mcp-tools/doc-rag-mcp-server/dist/index.js'
      )],
      env: Object.fromEntries(
        Object.entries(process.env).filter(([_, value]) => value !== undefined)
      ) as Record<string, string>,
    },
  },
});
