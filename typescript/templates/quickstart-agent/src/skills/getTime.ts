/**
 * GetTime Skill - Demonstrates manual handler
 * Bypasses LLM orchestration by providing a handler
 */

import { z } from 'zod';
import { defineSkill, createInfoMessage, getCurrentTimestamp } from '@emberai/arbitrum-vibekit-core';
import type { Message } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Input schema
const GetTimeInputSchema = z.object({
  timezone: z.string().optional().describe('Timezone to get time for (default: UTC)'),
  format: z.enum(['iso', 'unix', 'human']).optional().describe('Time format'),
});

// Dummy tool (required by framework, but won't be used with manual handler)
const dummyTimeTool = {
  name: 'dummy-time-tool',
  description: 'Dummy tool for getTime skill',
  parameters: z.object({}),
  execute: async () => {
    throw new Error('This tool should not be called when manual handler is provided');
  },
};

export const getTimeSkill = defineSkill({
  id: 'get-time-skill',
  name: 'getTime',
  description: 'Get the current time in specified timezone and format',

  tags: ['utility', 'time'],
  examples: ['What time is it?', 'Get current time in UTC', 'Show time in unix format'],

  inputSchema: GetTimeInputSchema,

  // Tools are required, but won't be used with manual handler
  tools: [dummyTimeTool],

  // Manual handler - bypasses LLM orchestration
  handler: async (input): Promise<Message> => {
    console.error('[GetTimeSkill] Manual handler called with:', input);

    // Get current time
    const currentTime = getCurrentTimestamp();
    const date = new Date(currentTime);

    // Format based on request
    let formattedTime: string;
    switch (input.format) {
      case 'unix':
        formattedTime = Math.floor(date.getTime() / 1000).toString();
        break;
      case 'human':
        formattedTime = date.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        break;
      case 'iso':
      default:
        formattedTime = currentTime;
    }

    const timezone = input.timezone || 'UTC';
    const message = `The current time in ${timezone} is: ${formattedTime}`;

    // Return a Message (not Task) - demonstrates using utility functions
    return createInfoMessage(
      message,
      'agent',
      `getTime-${Date.now()}`, // contextId
    );
  },

  // MCP server for time services (demonstrates single MCP server)
  mcpServers: {
    time: {
      command: 'tsx',
      moduleName: path.join(__dirname, '../../mock-mcp-servers/mock-mcp-time.ts'),
      env: {
        ...process.env,
        DEBUG: 'true',
      },
    },
  },
});
