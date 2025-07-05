import { defineSkill } from 'arbitrum-vibekit-core';
import { z } from 'zod';
import { clearIndexTool } from '../tools/clearIndex.js';
import { listIndexedUrlsTool } from '../tools/listIndexedUrls.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const documentationManagementSkill = defineSkill({
  id: 'documentation-management',
  name: 'Documentation Management',
  description: 'Manage the documentation index - list indexed URLs or clear the entire index',
  tags: ['documentation', 'management', 'index', 'admin'],
  examples: [
    'Show me all indexed documentation',
    'List all URLs in the index',
    'Clear the documentation index',
    'What documentation has been indexed?',
  ],
  inputSchema: z.object({
    instruction: z
      .string()
      .describe('Natural language instruction for managing the documentation index'),
  }),
  tools: [listIndexedUrlsTool, clearIndexTool],

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
