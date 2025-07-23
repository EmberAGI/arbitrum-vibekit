#!/usr/bin/env tsx
/**
 * Mock MCP Language Server
 * Provides supported language information for testing MCP integration
 */

/// <reference types="node" />

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Language data
const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', rtl: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', rtl: false },
  { code: 'fr', name: 'French', nativeName: 'Français', rtl: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', rtl: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'zh', name: 'Chinese', nativeName: '中文', rtl: false },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', rtl: false },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', rtl: false },
];

// Tool schemas
const GetLanguagesSchema = z.object({
  filter: z.string().optional().describe('Optional filter to search languages by name or code'),
});

const GetLanguageInfoSchema = z.object({
  languageCode: z.string().describe('Language code to get information for'),
});

// Create MCP server
const server = new Server(
  {
    name: 'mock-mcp-language',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'getSupportedLanguages',
        description: 'Get list of supported languages',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Optional filter to search languages by name or code',
            },
          },
        },
      },
      {
        name: 'getLanguageInfo',
        description: 'Get detailed information about a specific language',
        inputSchema: {
          type: 'object',
          properties: {
            languageCode: {
              type: 'string',
              description: 'Language code to get information for',
            },
          },
          required: ['languageCode'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  try {
    switch (name) {
      case 'getSupportedLanguages': {
        const args = GetLanguagesSchema.parse(request.params.arguments || {});
        let languages = [...LANGUAGES];

        // Apply filter if provided
        if (args.filter) {
          const filterLower = args.filter.toLowerCase();
          languages = languages.filter(
            (lang) =>
              lang.code.toLowerCase().includes(filterLower) ||
              lang.name.toLowerCase().includes(filterLower) ||
              lang.nativeName.toLowerCase().includes(filterLower),
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                languages,
                count: languages.length,
              }),
            },
          ],
        };
      }

      case 'getLanguageInfo': {
        const args = GetLanguageInfoSchema.parse(request.params.arguments);
        const language = LANGUAGES.find((lang) => lang.code === args.languageCode);

        if (!language) {
          throw new Error(`Language not found: ${args.languageCode}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ...language,
                isSupported: true,
                features: {
                  translation: true,
                  textToSpeech: false,
                  spellCheck: true,
                },
              }),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.message}`);
    }
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Language service error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Mock MCP Language Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
