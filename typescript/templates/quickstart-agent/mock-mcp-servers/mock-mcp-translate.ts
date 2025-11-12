#!/usr/bin/env tsx
/**
 * Mock MCP Translate Server
 * Provides mock translation services for testing MCP integration
 */

/// <reference types="node" />

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Translation data - simple mock translations
const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    hello: 'Hello',
    goodbye: 'Goodbye',
    'thank you': 'Thank you',
    'good morning': 'Good morning',
    'good evening': 'Good evening',
  },
  es: {
    hello: 'Hola',
    goodbye: 'Adiós',
    'thank you': 'Gracias',
    'good morning': 'Buenos días',
    'good evening': 'Buenas tardes',
  },
  fr: {
    hello: 'Bonjour',
    goodbye: 'Au revoir',
    'thank you': 'Merci',
    'good morning': 'Bonjour',
    'good evening': 'Bonsoir',
  },
  de: {
    hello: 'Hallo',
    goodbye: 'Auf Wiedersehen',
    'thank you': 'Danke',
    'good morning': 'Guten Morgen',
    'good evening': 'Guten Abend',
  },
  ja: {
    hello: 'こんにちは',
    goodbye: 'さようなら',
    'thank you': 'ありがとう',
    'good morning': 'おはよう',
    'good evening': 'こんばんは',
  },
};

// Tool schemas
const TranslateSchema = z.object({
  text: z.string().describe('The text to translate'),
  targetLanguage: z.string().describe('Target language code (e.g., es, fr, de, ja)'),
  sourceLanguage: z.string().optional().default('en').describe('Source language code (default: en)'),
});

// Create MCP server
const server = new Server(
  {
    name: 'mock-mcp-translate',
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
        name: 'translate',
        description: 'Translate text between languages',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The text to translate',
            },
            targetLanguage: {
              type: 'string',
              description: 'Target language code (e.g., es, fr, de, ja)',
            },
            sourceLanguage: {
              type: 'string',
              description: 'Source language code (default: en)',
              default: 'en',
            },
          },
          required: ['text', 'targetLanguage'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'translate') {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }

  try {
    const args = TranslateSchema.parse(request.params.arguments);
    const { text, targetLanguage, sourceLanguage } = args;

    // Simulate translation delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check if target language is supported
    if (!TRANSLATIONS[targetLanguage]) {
      throw new Error(`Unsupported target language: ${targetLanguage}`);
    }

    // Simple mock translation: if we have an exact match, use it
    // Otherwise, just return the text with a language prefix
    const sourceTrans = TRANSLATIONS[sourceLanguage] || TRANSLATIONS['en'];
    const targetTrans = TRANSLATIONS[targetLanguage];

    // Try to find the text in source translations
    let translationKey: string | undefined;
    if (sourceTrans) {
      for (const [key, value] of Object.entries(sourceTrans)) {
        if (value.toLowerCase() === text.toLowerCase()) {
          translationKey = key;
          break;
        }
      }
    }

    let translatedText: string;
    if (translationKey && targetTrans[translationKey]) {
      translatedText = targetTrans[translationKey]!;
    } else {
      // Fallback: just add language prefix for demo
      translatedText = `[${targetLanguage}] ${text}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            original: text,
            translated: translatedText,
            sourceLanguage,
            targetLanguage,
          }),
        },
      ],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${error.message}`);
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Mock MCP Translate Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
