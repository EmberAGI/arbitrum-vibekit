#!/usr/bin/env tsx
/**
 * Mock MCP Time Server
 * Provides timezone and time-related services for testing MCP integration
 */

/// <reference types="node" />

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Timezone data (simplified)
const TIMEZONES = [
  { id: 'UTC', name: 'Coordinated Universal Time', offset: 0 },
  { id: 'America/New_York', name: 'Eastern Time', offset: -5 },
  { id: 'America/Chicago', name: 'Central Time', offset: -6 },
  { id: 'America/Denver', name: 'Mountain Time', offset: -7 },
  { id: 'America/Los_Angeles', name: 'Pacific Time', offset: -8 },
  { id: 'Europe/London', name: 'Greenwich Mean Time', offset: 0 },
  { id: 'Europe/Paris', name: 'Central European Time', offset: 1 },
  { id: 'Asia/Tokyo', name: 'Japan Standard Time', offset: 9 },
  { id: 'Asia/Shanghai', name: 'China Standard Time', offset: 8 },
  { id: 'Australia/Sydney', name: 'Australian Eastern Time', offset: 10 },
];

// Tool schemas
const GetCurrentTimeSchema = z.object({
  timezone: z.string().optional().default('UTC').describe('Timezone ID (default: UTC)'),
  format: z.enum(['iso', 'unix', 'human']).optional().default('iso').describe('Time format'),
});

const ConvertTimeSchema = z.object({
  time: z.string().describe('Time to convert (ISO format or unix timestamp)'),
  fromTimezone: z.string().describe('Source timezone ID'),
  toTimezone: z.string().describe('Target timezone ID'),
});

const GetTimezonesSchema = z.object({
  filter: z.string().optional().describe('Optional filter to search timezones'),
});

// Create MCP server
const server = new Server(
  {
    name: 'mock-mcp-time',
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
        name: 'getCurrentTime',
        description: 'Get current time in specified timezone',
        inputSchema: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Timezone ID (default: UTC)',
              default: 'UTC',
            },
            format: {
              type: 'string',
              enum: ['iso', 'unix', 'human'],
              description: 'Time format',
              default: 'iso',
            },
          },
        },
      },
      {
        name: 'convertTime',
        description: 'Convert time between timezones',
        inputSchema: {
          type: 'object',
          properties: {
            time: {
              type: 'string',
              description: 'Time to convert (ISO format or unix timestamp)',
            },
            fromTimezone: {
              type: 'string',
              description: 'Source timezone ID',
            },
            toTimezone: {
              type: 'string',
              description: 'Target timezone ID',
            },
          },
          required: ['time', 'fromTimezone', 'toTimezone'],
        },
      },
      {
        name: 'getTimezones',
        description: 'Get list of available timezones',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Optional filter to search timezones',
            },
          },
        },
      },
    ],
  };
});

// Helper function to get timezone offset
function getTimezoneOffset(timezoneId: string): number {
  const tz = TIMEZONES.find((t) => t.id === timezoneId);
  return tz ? tz.offset : 0;
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  try {
    switch (name) {
      case 'getCurrentTime': {
        const args = GetCurrentTimeSchema.parse(request.params.arguments || {});
        const { timezone, format } = args;

        // Validate timezone
        if (!TIMEZONES.find((tz) => tz.id === timezone)) {
          throw new Error(`Unknown timezone: ${timezone}`);
        }

        const now = new Date();
        const offset = getTimezoneOffset(timezone);
        const tzTime = new Date(now.getTime() + offset * 60 * 60 * 1000);

        let formattedTime: string;
        switch (format) {
          case 'unix':
            formattedTime = Math.floor(tzTime.getTime() / 1000).toString();
            break;
          case 'human':
            formattedTime = tzTime.toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short',
            });
            break;
          case 'iso':
          default:
            formattedTime = tzTime.toISOString();
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                time: formattedTime,
                timezone,
                format,
                offset: `UTC${offset >= 0 ? '+' : ''}${offset}`,
              }),
            },
          ],
        };
      }

      case 'convertTime': {
        const args = ConvertTimeSchema.parse(request.params.arguments);
        const { time, fromTimezone, toTimezone } = args;

        // Validate timezones
        if (!TIMEZONES.find((tz) => tz.id === fromTimezone)) {
          throw new Error(`Unknown source timezone: ${fromTimezone}`);
        }
        if (!TIMEZONES.find((tz) => tz.id === toTimezone)) {
          throw new Error(`Unknown target timezone: ${toTimezone}`);
        }

        // Parse input time
        let inputDate: Date;
        if (/^\d+$/.test(time)) {
          // Unix timestamp
          inputDate = new Date(parseInt(time) * 1000);
        } else {
          inputDate = new Date(time);
          if (isNaN(inputDate.getTime())) {
            throw new Error('Invalid time format');
          }
        }

        // Convert between timezones
        const fromOffset = getTimezoneOffset(fromTimezone);
        const toOffset = getTimezoneOffset(toTimezone);
        const utcTime = new Date(inputDate.getTime() - fromOffset * 60 * 60 * 1000);
        const convertedTime = new Date(utcTime.getTime() + toOffset * 60 * 60 * 1000);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                originalTime: inputDate.toISOString(),
                convertedTime: convertedTime.toISOString(),
                fromTimezone,
                toTimezone,
                timeDifference: `${Math.abs(toOffset - fromOffset)} hours`,
              }),
            },
          ],
        };
      }

      case 'getTimezones': {
        const args = GetTimezonesSchema.parse(request.params.arguments || {});
        let timezones = [...TIMEZONES];

        // Apply filter if provided
        if (args.filter) {
          const filterLower = args.filter.toLowerCase();
          timezones = timezones.filter(
            (tz) => tz.id.toLowerCase().includes(filterLower) || tz.name.toLowerCase().includes(filterLower),
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timezones: timezones.map((tz) => ({
                  ...tz,
                  currentTime: new Date(Date.now() + tz.offset * 60 * 60 * 1000).toISOString(),
                })),
                count: timezones.length,
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
      `Time service error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Mock MCP Time Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
