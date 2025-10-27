/**
 * Greet Skill - Demonstrates LLM orchestration
 * Uses multiple tools and MCP servers
 */

import { z } from 'zod';
import { defineSkill } from '@emberai/arbitrum-vibekit-core';
import { getFormalGreetingTool } from '../tools/getFormalGreeting.js';
import { getCasualGreetingTool } from '../tools/getCasualGreeting.js';
import { getLocalizedGreetingTool } from '../tools/getLocalizedGreeting.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input schema for the greet skill
const GreetInputSchema = z.object({
  name: z.string().min(1).describe('Name of the person to greet'),
  style: z.enum(['formal', 'casual', 'localized']).describe('Greeting style'),
  language: z.string().optional().describe('Language code for localized greetings'),
});

export const greetSkill = defineSkill({
  // Skill metadata
  id: 'greet-skill', // Tests skill ID vs name
  name: 'greet',
  description: 'Generate personalized greetings in different styles',

  // Required tags and examples
  tags: ['greeting', 'personalization', 'multi-language'],
  examples: ['Greet Alice formally', 'Say hello to Bob casually', 'Greet Carlos in Spanish'],

  // Schemas
  inputSchema: GreetInputSchema,

  // Tools available to this skill (required in v2)
  tools: [getFormalGreetingTool, getCasualGreetingTool, getLocalizedGreetingTool],

  // MCP servers this skill needs
  mcpServers: {
    translate: {
      // Translation MCP server
      command: 'tsx',
      moduleName: path.join(__dirname, '../../mock-mcp-servers/mock-mcp-translate.ts'),
      env: {
        ...process.env,
        DEBUG: 'true',
      },
    },
    language: {
      // Language detection MCP server
      command: 'tsx',
      moduleName: path.join(__dirname, '../../mock-mcp-servers/mock-mcp-language.ts'),
      env: {
        ...process.env,
        DEBUG: 'true',
      },
    },
  },

  // No handler - will use LLM orchestration by default
  // This demonstrates the LLM-first approach with optional manual handlers
});
